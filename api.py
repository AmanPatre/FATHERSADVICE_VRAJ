import json
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import traceback
import re
from bson import ObjectId

app = Flask(__name__)
CORS(app)  # Enable cross-origin requests

# --- Gemini API Configuration ---
API_KEY = "AIzaSyBAu9bzZwVQaIy8r847BN1_SITIGKXwu1c"  # Replace with actual key
genai.configure(api_key=API_KEY)

# --- MongoDB Connection ---
MONGO_URI = "mongodb+srv://gamingworld448:gOahhJ6fKBcsCQKz@testing.9ivcc.mongodb.net/?retryWrites=true&w=majority&appName=testing"
DB_NAME = "project"

try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    mongo_client.server_info()  # Test connection
    db = mongo_client[DB_NAME]
    mentees_collection = db["mentees"]
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

# --- Flask Endpoints ---
@app.route("/submit_doubt", methods=["POST"])
def submit_doubt():
    try:
        data = request.get_json()
        mentee_id = data.get("mentee_id")
        doubt_text = data.get("doubt")

        if not mentee_id or not doubt_text:
            return jsonify({"error": "Both 'mentee_id' and 'doubt' are required."}), 400

        # Convert ID to ObjectId if valid
        try:
            mentee_id = ObjectId(mentee_id)
        except:
            print(f"Warning: Could not convert {mentee_id} to ObjectId, using as string.")

        # Store doubt in DB
        mentees_collection.update_one({"_id": mentee_id}, {"$set": {"doubt": doubt_text}}, upsert=True)

        # Get AI-generated subject breakdown
        breakdown = get_subject_breakdown(doubt_text)

        # Store breakdown in DB
        update_mentee_with_breakdown(mentee_id, breakdown)

        return jsonify({"mentee_id": str(mentee_id), "subject_breakdown": breakdown})
    except Exception as e:
        print(f"Error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/test", methods=["GET"])
def test_endpoint():
    return jsonify({"status": "API is running"}), 200

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)  # Use port 5001
