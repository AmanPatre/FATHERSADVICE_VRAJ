from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS  # You might need to install this
from pymongo import MongoClient
import numpy as np
from scipy.optimize import linear_sum_assignment
import sys

app = Flask(__name__)
CORS(app)  # Enable CORS

# --------------------
# MongoDB Configuration
# --------------------
# Replace with environment variable or configuration file
DB_NAME = "project"
client = MongoClient("mongodb://localhost:27017/")
db = client[DB_NAME]  # Use the same database name as other services

mentors_collection = db['mentors']       # Collection holding mentor documents
mentees_collection = db['mentees']         # Collection holding mentee documents
matches_collection = db['matches_results'] # Collection where matching results are stored
sessions_collection = db['sessions']
mentors_result_collection = db['mentors_result']

# --------------------
# Matching Criteria Weights & Normalization
# --------------------
# Weights for the five matching criteria (they should sum to 1)
W1 = 0.3   # Skill Match (Jaccard similarity on "skills")
W2 = 0.25  # Experience Match (mentor must have equal or greater experience)
W3 = 0.2   # Availability Match (ratio of overlapping hours)
W4 = 0.15  # Location Match (binary: 1 if same region, else 0)
W5 = 0.1   # Workload Balancing (penalize mentors with high workload)

# Maximum values for normalization
MAX_EXPERIENCE_DIFF = 10   # Maximum expected difference in years
MAX_WORKLOAD = 5           # Maximum acceptable workload (number of active mentees)
print("algo.py is running...")

# --------------------
# Helper Functions for Sub-Scores
# --------------------
def jaccard_similarity(set1, set2):
    """Compute the Jaccard similarity between two sets."""
    if not set1 and not set2:
        return 1.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0

def compute_S1(mentee_skills, mentor_skills):
    """Skill match (S1) using Jaccard similarity."""
    return jaccard_similarity(set(mentee_skills), set(mentor_skills))

def compute_S2(mentee_exp, mentor_exp):
    """
    Experience match (S2): Mentor must have equal or more experience.
    If mentee's experience is greater than mentor's, return 0.
    Otherwise, return a scaled score.
    """
    if mentee_exp > mentor_exp:
        return 0.0
    diff = mentor_exp - mentee_exp
    return max(0, 1 - diff / MAX_EXPERIENCE_DIFF)

def compute_S3(mentee_pref_hours, mentor_available_hours):
    """
    Availability match (S3): Ratio of overlapping hours to mentee's preferred hours.
    """
    if mentee_pref_hours <= 0:
        return 0.0
    overlap = min(mentor_available_hours, mentee_pref_hours)
    return min(overlap / mentee_pref_hours, 1.0)

def compute_S4(mentee_location, mentor_location):
    """
    Location match (S4): Returns 1 if mentor and mentee share the same region; else 0.
    """
    return 1.0 if mentee_location == mentor_location else 0.0

def compute_S5(mentor_workload):
    """
    Workload balancing (S5): Penalize mentors with higher workloads.
    """
    return max(0, 1 - mentor_workload / MAX_WORKLOAD)

def compute_subject_match(mentee_subjects, mentor_subjects):
    """Compute subject compatibility based on subject breakdown percentages."""
    if not mentee_subjects or not mentor_subjects:
        return 0.0
    
    # Convert to dictionaries for easier lookup
    mentee_subjects = {s['subject'].lower(): s['percentage'] for s in mentee_subjects.get('results', [])}
    mentor_subjects = {s['subject'].lower(): s['percentage'] for s in mentor_subjects.get('results', [])}
    
    total_score = 0.0
    total_weight = 0.0
    
    # Calculate weighted match score
    for subject, mentee_percentage in mentee_subjects.items():
        mentor_percentage = mentor_subjects.get(subject, 0)
        # Calculate match score based on percentage overlap
        match_score = min(mentee_percentage, mentor_percentage)
        # Weight the match by mentee's interest percentage
        total_score += match_score * mentee_percentage
        total_weight += mentee_percentage
    
    # Normalize the score
    return total_score / total_weight if total_weight > 0 else 0.0

def compute_compatibility(mentee, mentor):
    """
    Compute the overall compatibility score for a mentor-mentee pair.
    Now includes subject breakdown matching.
    """
    # Get subject breakdowns
    mentee_subjects = mentee.get('subject_breakdown', {})
    mentor_subjects = mentor.get('subject_breakdown', {})
    
    # Calculate subject match score
    subject_score = compute_subject_match(mentee_subjects, mentor_subjects)
    
    # Calculate other compatibility scores
    skill_score = compute_S1(mentee.get('skills', []), mentor.get('skills', []))
    experience_score = compute_S2(mentee.get('experience', 0), mentor.get('experience', 0))
    availability_score = compute_S3(mentee.get('preferred_hours', 0), mentor.get('available_hours', 0))
    location_score = compute_S4(mentee.get('location', ''), mentor.get('location', ''))
    workload_score = compute_S5(mentor.get('workload', 0))
    
    # Updated weights to include subject matching
    weights = {
        'subject': 0.35,  # Increased weight for subject matching
        'skill': 0.25,
        'experience': 0.15,
        'availability': 0.10,
        'location': 0.10,
        'workload': 0.05
    }
    
    # Calculate weighted sum
    final_score = (
        weights['subject'] * subject_score +
        weights['skill'] * skill_score +
        weights['experience'] * experience_score +
        weights['availability'] * availability_score +
        weights['location'] * location_score +
        weights['workload'] * workload_score
    )
    
    return final_score

def get_online_mentors():
    """Get all online mentors."""
    return list(mentors_collection.find({"is_online": True}))

def get_offline_mentors():
    """Get all offline mentors."""
    return list(mentors_collection.find({"is_online": False}))

def match_mentor_mentee(mentee, mentors):
    """Match a single mentee with the best available mentor."""
    best_match = None
    best_score = -1
    
    for mentor in mentors:
        score = compute_compatibility(mentee, mentor)
        if score > best_score:
            best_score = score
            best_match = {
                "mentor_id": mentor["_id"],
                "compatibility_score": score,
                "mentor_details": {
                    "name": mentor.get("name", ""),
                    "skills": mentor.get("skills", []),
                    "experience": mentor.get("experience", 0),
                    "location": mentor.get("location", ""),
                    "available_hours": mentor.get("available_hours", 0),
                    "is_online": mentor.get("is_online", False)
                }
            }
    
    return best_match

# --------------------
# Flask API Endpoint for Advanced Matching
# --------------------
@app.route('/match_advanced', methods=['POST'])
def match_advanced():
    try:
        data = request.get_json() or {}
        mentee_id = data.get('mentee_id')
        mentor_ids = data.get('mentor_ids', [])

        if not mentee_id:
            return jsonify({"error": "mentee_id is required"}), 400

        # Get the mentee with subject breakdown
        mentee = mentees_collection.find_one({"_id": mentee_id})
        if not mentee:
            return jsonify({"error": "Mentee not found"}), 404

        # Get the pre-matched mentors with subject breakdowns
        if not mentor_ids:
            mentors_result = mentors_result_collection.find_one({"mentee_id": mentee_id})
            if not mentors_result:
                return jsonify({"error": "No pre-matched mentors found"}), 404
            mentor_ids = [m["mentor_id"] for m in mentors_result.get("matched_mentors", [])]

        # Get online mentors with their subject breakdowns
        mentors = list(mentors_collection.find({
            "_id": {"$in": mentor_ids},
            "is_online": True
        }))

        # Get all matched mentors for offline section
        mentors_result = mentors_result_collection.find_one({"mentee_id": mentee_id})
        if not mentors_result:
            return jsonify({"error": "No matched mentors found"}), 404

        matched_mentors = mentors_result.get("matched_mentors", [])
        offline_mentors = [m for m in matched_mentors if not m["mentor_details"]["is_online"]]

        if not mentors:
            return jsonify({
                "status": "offline",
                "matched_section": None,
                "offline_section": {
                    "mentors": offline_mentors,
                    "total_offline": len(offline_mentors)
                },
                "message": "No online mentors available. Showing all matched mentors."
            })

        # Build cost matrix using enhanced compatibility scores
        num_mentors = len(mentors)
        cost_matrix = np.zeros((1, num_mentors))

        for j, mentor in enumerate(mentors):
            compatibility = compute_compatibility(mentee, mentor)
            cost_matrix[0, j] = 1 - compatibility

        # Use Hungarian algorithm to find the best match
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        best_mentor_idx = col_ind[0]
        best_mentor = mentors[best_mentor_idx]
        compatibility_score = 1 - cost_matrix[0, best_mentor_idx]

        # Prepare match result with subject breakdown
        match_result = {
            "status": "success",
            "match": {
                "mentor_id": best_mentor["_id"],
                "compatibility_score": compatibility_score,
                "mentor_details": {
                    "name": best_mentor.get("name", ""),
                    "skills": best_mentor.get("skills", []),
                    "experience": best_mentor.get("experience", 0),
                    "location": best_mentor.get("location", ""),
                    "available_hours": best_mentor.get("available_hours", 0),
                    "is_online": best_mentor.get("is_online", False)
                }
            },
            "offline_section": {
                "mentors": offline_mentors,
                "total_offline": len(offline_mentors)
            }
        }

        return jsonify(match_result)

    except Exception as e:
        print(f"Error in match_advanced: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/update_online_status", methods=["POST"])
def update_online_status():
    try:
        data = request.get_json()
        mentor_id = data.get("mentor_id")
        is_online = data.get("is_online", False)

        if not mentor_id:
            return jsonify({"error": "mentor_id is required"}), 400

        # Update mentor's online status
        result = mentors_collection.update_one(
            {"_id": mentor_id},
            {"$set": {"is_online": is_online, "last_active": datetime.now()}}
        )

        if result.modified_count == 0:
            return jsonify({"error": "Mentor not found"}), 404

        return jsonify({
            "status": "success",
            "message": f"Mentor status updated to {'online' if is_online else 'offline'}"
        })

    except Exception as e:
        print(f"Error in update_online_status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/submit_doubt", methods=["POST"])
def submit_doubt():
    try:
        data = request.get_json()
        mentee_id = data.get("mentee_id")
        doubt_text = data.get("doubt")

        if not mentee_id or not doubt_text:
            return jsonify({"error": "mentee_id and doubt are required"}), 400

        # Get mentee data
        mentee = mentees_collection.find_one({"_id": mentee_id})
        if not mentee:
            return jsonify({"error": "Mentee not found"}), 404

        # Get available mentors
        mentors = list(mentors_collection.find({"is_online": True}))
        if not mentors:
            return jsonify({
                "status": "offline",
                "message": "No online mentors available"
            }), 200

        # Find best matching mentor
        best_match = match_mentor_mentee(mentee, mentors)
        if best_match:
            return jsonify({
                "status": "success",
                "match": best_match
            })

        return jsonify({
            "status": "no_match",
            "message": "No suitable mentor found"
        })

    except Exception as e:
        print(f"Error in submit_doubt: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health_check():
    try:
        # Check MongoDB connection
        client.server_info()
        
        # Check if all required collections exist and are accessible
        collections = {
            'mentees': mentees_collection,
            'mentors': mentors_collection,
            'matches': matches_collection,
            'sessions': sessions_collection
        }
        
        collection_status = {}
        for name, collection in collections.items():
            try:
                # Try to perform a simple operation on each collection
                collection.find_one()
                collection_status[name] = "available"
            except Exception as e:
                collection_status[name] = f"error: {str(e)}"
                return jsonify({
                    "status": "unhealthy",
                    "service": "algo",
                    "error": f"Collection {name} is not accessible",
                    "details": str(e),
                    "timestamp": datetime.now().isoformat()
                }), 500
            
        return jsonify({
            "status": "healthy",
            "service": "algo",
            "timestamp": datetime.now().isoformat(),
            "dependencies": {
                "mongodb": "connected",
                "collections": collection_status
            }
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "service": "algo",
            "error": "MongoDB connection failed",
            "details": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    try:
        print("Starting algorithm service on port 5000...")
        app.run(host='0.0.0.0', port=5000)
    except Exception as e:
        print(f"Error starting algorithm service: {e}")
        sys.exit(1)