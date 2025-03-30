import google.generativeai as genai

API_KEY = "AIzaSyBAu9bzZwVQaIy8r847BN1_SITIGKXwu1c"  # Replace with your actual API key
genai.configure(api_key=API_KEY)

prompt = "Sex"
print("Prompt:", prompt)

try:
    model = genai.GenerativeModel("gemini-1.5-flash")  # Ensure you use the correct model name
    response = model.generate_content(prompt)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)
