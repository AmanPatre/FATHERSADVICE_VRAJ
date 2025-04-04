import json
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import traceback
import re
import uuid
import requests
from datetime import datetime
import sys

app = Flask(__name__)
CORS(app)

# --- Gemini API Configuration ---
API_KEY = "AIzaSyBAu9bzZwVQaIy8r847BN1_SITIGKXwu1c"  # Replace with actual key
genai.configure(api_key=API_KEY)

# --- MongoDB Connection ---
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "project"

try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo_client.server_info()
    db = mongo_client[DB_NAME]
    mentees_collection = db["mentees"]
    mentors_collection = db["mentors"]
    matches_collection = db["matches_results"]
    mentors_result_collection = db["mentors_result"]
    sessions_collection = db["sessions"]
    print("Connected to MongoDB")
except Exception as e:
    print(f"MongoDB Connection Error: {e}")
    exit(1)

# --- AI Response Cleaner ---
def clean_ai_response(response_text):
    """Cleans JSON output from AI responses."""
    response_text = response_text.strip()
    response_text = re.sub(r"```json\n?|```", "", response_text)  # Remove markdown JSON tags
    return response_text.strip()

# --- Gemini AI Subject Breakdown ---
def get_subject_breakdown(doubt_text):
    try:
        prompt = (
            "Convert the following doubt into a JSON breakdown of five subjects. "
            "Each subject should have a 'subject' key (string) and a 'percentage' key (0-1 sum to 1). "
            f"Example: {{ 'results': [ {{ 'subject': 'Math', 'percentage': 0.3 }}, {{ 'subject': 'Science', 'percentage': 0.2 }} ] }}. "
            f"\nMentee doubt: {doubt_text}"
        )
        
        model = genai.GenerativeModel("gemini-1.5-flash")  # Correct model name
        response = model.generate_content(prompt)
        
        cleaned_text = clean_ai_response(response.text)
        breakdown = json.loads(cleaned_text)
        return breakdown
    except Exception as e:
        print(f"Error in AI breakdown: {e}\n{traceback.format_exc()}")
        return {"results": [{"subject": "Unknown", "percentage": 1.0}]}

# --- Update MongoDB with Breakdown ---
def update_mentee_with_breakdown(mentee_id, breakdown):
    try:
        result = mentees_collection.update_one(
            {"_id": mentee_id},
            {"$set": {"subject_breakdown": breakdown}},
            upsert=True
        )
        return result.modified_count
    except Exception as e:
        print(f"MongoDB Update Error: {e}\n{traceback.format_exc()}")
        return 0

def match_subjects(mentee_subjects, mentor_subjects):
    """Match subjects based on percentages and return a score."""
    if not mentee_subjects or not mentor_subjects:
        return 0.0
    
    mentee_subjects = {s['subject'].lower(): s['percentage'] for s in mentee_subjects.get('results', [])}
    mentor_subjects = {s['subject'].lower(): s['percentage'] for s in mentor_subjects.get('results', [])}
    
    total_score = 0.0
    for subject, mentee_percentage in mentee_subjects.items():
        mentor_percentage = mentor_subjects.get(subject, 0)
        # Calculate match score based on percentage overlap
        match_score = min(mentee_percentage, mentor_percentage)
        total_score += match_score
    
    return total_score

# --- Flask Endpoints ---
@app.route("/submit_doubt", methods=["POST"])
def submit_doubt():
    try:
        data = request.get_json()
        mentee_id = data.get("mentee_id")
        doubt_text = data.get("doubt")

        if not mentee_id or not doubt_text:
            return jsonify({"error": "Both 'mentee_id' and 'doubt' are required."}), 400

        # Store doubt in DB
        mentees_collection.update_one(
            {"_id": mentee_id}, 
            {"$set": {"doubt": doubt_text, "last_active": datetime.now()}}, 
            upsert=True
        )

        # Get AI-generated subject breakdown
        breakdown = get_subject_breakdown(doubt_text)

        # Store breakdown in DB
        mentees_collection.update_one(
            {"_id": mentee_id},
            {"$set": {"subject_breakdown": breakdown}},
            upsert=True
        )

        # Get all mentors and match based on subjects
        mentors = list(mentors_collection.find({}))
        matched_mentors = []

        for mentor in mentors:
            mentor_subjects = mentor.get("subject_breakdown", {})
            match_score = match_subjects(breakdown, mentor_subjects)
            
            if match_score > 0.3:  # Threshold for subject matching
                matched_mentors.append({
                    "mentor_id": mentor["_id"],
                    "match_score": match_score,
                    "mentor_details": {
                        "name": mentor.get("name", ""),
                        "skills": mentor.get("skills", []),
                        "subjects": mentor.get("subjects", []),
                        "is_online": mentor.get("is_online", False),
                        "experience": mentor.get("experience", 0),
                        "location": mentor.get("location", ""),
                        "available_hours": mentor.get("available_hours", 0)
                    }
                })

        # Store matched mentors in mentors_result collection
        mentors_result_collection.update_one(
            {"mentee_id": mentee_id},
            {
                "$set": {
                    "mentee_id": mentee_id,
                    "matched_mentors": matched_mentors,
                    "created_at": datetime.now()
                }
            },
            upsert=True
        )

        # Check if any matched mentors are online
        online_mentors = [m for m in matched_mentors if m["mentor_details"]["is_online"]]
        
        if online_mentors:
            # Call the matching algorithm for online mentors
            try:
                match_response = requests.post(
                    "http://localhost:5000/match_advanced",
                    json={
                        "mentee_id": mentee_id,
                        "mentor_ids": [m["mentor_id"] for m in online_mentors]
                    }
                )
                match_result = match_response.json()
                
                if "match" in match_result:
                    # Create a new session
                    session_data = {
                        "_id": f"session_{uuid.uuid4().hex[:6]}",
                        "mentee_id": mentee_id,
                        "mentor_id": match_result["match"]["mentor_id"],
                        "status": "active",
                        "created_at": datetime.now(),
                        "last_activity": datetime.now()
                    }
                    sessions_collection.insert_one(session_data)
                    
                    return jsonify({
                        "mentee_id": mentee_id,
                        "subject_breakdown": breakdown,
                        "match_result": match_result,
                        "session_status": "active",
                        "redirect_url": "/matching_interface"
                    })
            except Exception as e:
                print(f"Error in matching algorithm: {e}")

        # If no online mentors or matching failed, redirect to matching interface's offline section
        return jsonify({
            "mentee_id": mentee_id,
            "subject_breakdown": breakdown,
            "matched_mentors": matched_mentors,
            "session_status": "offline",
            "redirect_url": "/matching_interface/offline"
        })

    except Exception as e:
        print(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/matching_interface", methods=["GET"])
def get_matching_interface():
    try:
        mentee_id = request.args.get("mentee_id")
        if not mentee_id:
            return jsonify({"error": "mentee_id is required"}), 400

        # Get active session for matched section
        session = sessions_collection.find_one({
            "mentee_id": mentee_id,
            "status": "active"
        })
        
        # Get matched mentors from mentors_result for offline section
        mentors_result = mentors_result_collection.find_one({"mentee_id": mentee_id})
        if not mentors_result:
            return jsonify({"error": "No matched mentors found"}), 404

        matched_mentors = mentors_result.get("matched_mentors", [])
        offline_mentors = [m for m in matched_mentors if not m["mentor_details"]["is_online"]]

        response_data = {
            "mentee_id": mentee_id,
            "matched_section": None,
            "offline_section": {
                "mentors": offline_mentors,
                "total_offline": len(offline_mentors)
            }
        }

        # If there's an active session, add matched section data
        if session:
            mentor = mentors_collection.find_one({"_id": session["mentor_id"]})
            if mentor:
                response_data["matched_section"] = {
                    "session_id": session["_id"],
                    "mentor": {
                        "id": mentor["_id"],
                        "name": mentor.get("name", ""),
                        "skills": mentor.get("skills", []),
                        "experience": mentor.get("experience", 0),
                        "location": mentor.get("location", ""),
                        "available_hours": mentor.get("available_hours", 0)
                    }
                }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route('/health')
def health_check():
    try:
        # Check MongoDB connection
        mongo_client.server_info()
        
        # Check if all required collections exist and are accessible
        collections = {
            'mentees': mentees_collection,
            'mentors': mentors_collection,
            'matches': matches_collection,
            'mentors_result': mentors_result_collection,
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
                    "service": "api",
                    "error": f"Collection {name} is not accessible",
                    "details": str(e),
                    "timestamp": datetime.now().isoformat()
                }), 500
            
        return jsonify({
            "status": "healthy",
            "service": "api",
            "timestamp": datetime.now().isoformat(),
            "dependencies": {
                "mongodb": "connected",
                "collections": collection_status
            }
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "service": "api",
            "error": "MongoDB connection failed",
            "details": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    try:
        print("Starting API service on port 5001...")
        app.run(host='0.0.0.0', port=5001)
    except Exception as e:
        print(f"Error starting API service: {e}")
        sys.exit(1)
