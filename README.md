# Mentor-Mentee Matching System

A comprehensive system for matching mentees with mentors based on subject expertise, skills, and availability.

## Features

- Intelligent doubt analysis using Google's Gemini AI
- Advanced mentor matching algorithm
- Real-time matching interface
- MongoDB database for data persistence
- RESTful API endpoints
- Comprehensive logging and monitoring

## Prerequisites

- Python 3.8 or higher
- MongoDB 4.4 or higher
- Google Cloud Platform account (for Gemini AI)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mentor-mentee-matching
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Set up MongoDB:
```bash
# Start MongoDB service
sudo systemctl start mongod

# Verify MongoDB is running
mongo --eval "db.runCommand({connectionStatus:1})"
```

4. Set up environment variables:
Create a `.env` file in the project root with the following variables:
```
GOOGLE_API_KEY=your_gemini_api_key
MONGODB_URI=mongodb://localhost:27017/
```

## Running the System

1. Initialize the database:
```bash
python3 init_db.py
```

2. Start all services:
```bash
python3 run_services.py
```

The following services will be started:
- API Service: http://localhost:5000
- Algorithm Service: http://localhost:5001
- Workflow Service: http://localhost:5002
- Matching Interface: http://localhost:5002/matching_interface

## Testing the System

Run the complete workflow test:
```bash
python3 test_workflow.py
```

## API Endpoints

### API Service (Port 5000)
- `POST /api/mentees` - Create a new mentee
- `GET /api/mentees/<mentee_id>` - Get mentee details
- `POST /api/analyze-doubt` - Analyze a doubt using Gemini AI

### Algorithm Service (Port 5001)
- `POST /api/match` - Find matching mentors
- `GET /api/mentors` - Get all mentors
- `GET /api/mentors/<mentor_id>` - Get mentor details

### Workflow Service (Port 5002)
- `POST /api/submit-doubt` - Submit a new doubt
- `GET /api/match-status/<match_id>` - Get match status
- `GET /matching_interface` - Access the matching interface

## Logging

All service logs are stored in the `logs` directory:
- `api.log` - API service logs
- `algo.log` - Algorithm service logs
- `workflow.log` - Workflow service logs
- `service_manager.log` - Service manager logs
- `test_workflow.log` - Test workflow logs

## Troubleshooting

1. If MongoDB connection fails:
   - Ensure MongoDB is running: `sudo systemctl status mongod`
   - Check MongoDB logs: `tail -f /var/log/mongodb/mongod.log`

2. If services fail to start:
   - Check port availability: `lsof -i :<port>`
   - Review service logs in the `logs` directory

3. If matching fails:
   - Verify mentor data in MongoDB
   - Check algorithm service logs for matching criteria issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
