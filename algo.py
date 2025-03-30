from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS  # You might need to install this
from pymongo import MongoClient
import numpy as np
from scipy.optimize import linear_sum_assignment

app = Flask(__name__)
CORS(app)  # Enable CORS

# --------------------
# MongoDB Configuration
# --------------------
# Replace with environment variable or configuration file
client = MongoClient("mongodb+srv://gamingworld448:gOahhJ6fKBcsCQKz@testing.9ivcc.mongodb.net/?retryWrites=true&w=majority&appName=testing")
db = client['mentors']  # Adjust your database name here

mentors_collection = db['mentors']       # Collection holding mentor documents
mentees_collection = db['mentees']         # Collection holding mentee documents
matches_collection = db['matches_results'] # Collection where matching results are stored

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

def compute_compatibility(mentee, mentor):
    """
    Compute the overall compatibility score for a mentor–mentee pair.
    Expected fields:
      - For mentee: skills (list), experience (number), preferred_hours (number), location (string), subjects (dict)
      - For mentor: skills (list), experience (number), available_hours (number), location (string), workload (number), subjects (dict)
    
    (The "subjects" field is available if you wish to later add a lexicographic filtering,
     but here we focus on the five criteria above.)
    """
    S1 = compute_S1(mentee.get('skills', []), mentor.get('skills', []))
    S2 = compute_S2(mentee.get('experience', 0), mentor.get('experience', 0))
    S3 = compute_S3(mentee.get('preferred_hours', 0), mentor.get('available_hours', 0))
    S4 = compute_S4(mentee.get('location', ''), mentor.get('location', ''))
    S5 = compute_S5(mentor.get('workload', 0))
    
    final_score = W1 * S1 + W2 * S2 + W3 * S3 + W4 * S4 + W5 * S5
    return final_score

# --------------------
# Flask API Endpoint for Advanced Matching
# --------------------
@app.route('/match_advanced', methods=['POST'])
def match_advanced():
    """
    This endpoint performs advanced matching between mentors and mentees.
    Optionally, you can send a JSON payload with a "mentee_id" to retrieve the match for a specific mentee.
    Otherwise, it computes and returns the optimal matching for all mentees.
    """
    try:
        data = request.get_json() or {}
        target_mentee_id = data.get('mentee_id')

        # Retrieve all mentor and mentee documents from MongoDB.
        mentors = list(mentors_collection.find({}))
        mentees = list(mentees_collection.find({}))
        
        if not mentors or not mentees:
            return jsonify({"error": "Mentor or mentee data is missing."}), 400

        # Build lookup dictionaries keyed by _id
        mentor_dict = {str(mentor['_id']): mentor for mentor in mentors}
        mentee_dict = {str(mentee['_id']): mentee for mentee in mentees}

        mentor_ids = list(mentor_dict.keys())
        mentee_ids = list(mentee_dict.keys())

        num_mentees = len(mentee_ids)
        num_mentors = len(mentor_ids)

        # Initialize cost matrix: cost = 1 - compatibility_score (since we want to maximize compatibility)
        cost_matrix = np.zeros((num_mentees, num_mentors))

        for i, mentee_id in enumerate(mentee_ids):
            mentee = mentee_dict[mentee_id]
            for j, mentor_id in enumerate(mentor_ids):
                mentor = mentor_dict[mentor_id]
                compatibility = compute_compatibility(mentee, mentor)
                cost_matrix[i, j] = 1 - compatibility

        # Use the Hungarian algorithm to get the optimal assignment (minimizing total cost)
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        results = []
        for i, j in zip(row_ind, col_ind):
            mentee_id = mentee_ids[i]
            mentor_id = mentor_ids[j]
            cost = float(cost_matrix[i, j])
            compatibility = 1 - cost  # Recover the compatibility score
            match_data = {
                "mentee_id": mentee_id,
                "mentor_id": mentor_id,
                "compatibility_score": compatibility,
                "cost": cost
            }
            results.append(match_data)
            # Store or update this match in the "matches_results" collection
            matches_collection.update_one(
                {"mentee_id": mentee_id},
                {"$set": match_data},
                upsert=True
            )

        # If a specific mentee_id is provided, return that match; otherwise, return all matches.
        if target_mentee_id:
            for match in results:
                if match["mentee_id"] == target_mentee_id:
                    return jsonify({"match": match})
            return jsonify({"error": "Mentee ID not found in matches."}), 404

        return jsonify({"matches": results})
    
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route("/submit_doubt", methods=["POST"])
def submit_doubt():
    try:
        data = request.get_json()
        mentee_id = data.get("mentee_id")
        doubt_text = data.get("doubt")
        
        if not mentee_id or not doubt_text:
            return jsonify({"error": "Both 'mentee_id' and 'doubt' are required."}), 400
        
        # Store the doubt in MongoDB
        db.doubts.insert_one({
            "mentee_id": mentee_id,
            "doubt": doubt_text,
            "status": "pending",
            "created_at": datetime.now()
        })
        
        return jsonify({"status": "success", "message": "Doubt submitted successfully"})
    
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

# --------------------
# Run the Flask Application
# --------------------
if __name__ == "__main__":
    # Set debug=False for production
    app.run(debug=True, host="0.0.0.0", port=5000)