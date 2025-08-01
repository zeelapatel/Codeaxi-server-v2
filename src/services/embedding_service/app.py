# embedding_service/app.py
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import torch
import os

app = Flask(__name__)

# --- Configuration ---
# User requested model
HF_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Determine device (GPU if available, else CPU)
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading Hugging Face model: {HF_MODEL_NAME} on device: {device}")

try:
    # all-MiniLM-L6-v2 typically does not require trust_remote_code=True
    model = SentenceTransformer(HF_MODEL_NAME, device=device)
    print("Hugging Face model loaded successfully.")
except Exception as e:
    print(f"Error loading Hugging Face model: {e}")
    # Consider more robust error handling for production
    exit(1)

@app.route('/embed', methods=['POST'])
def embed_texts():
    data = request.json
    texts = data.get('texts')
    print("trying to embed")
    if not texts or not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
        return jsonify({"error": "Invalid input. 'texts' must be a list of strings."}), 400

    try:
        # Encode the texts
        embeddings = model.encode(texts, convert_to_numpy=True).tolist()
        return jsonify({"embeddings": embeddings}), 200
    except Exception as e:
        print(f"Error during embedding: {e}")
        return jsonify({"error": "Failed to generate embeddings."}), 500

if __name__ == '__main__':
    # You can customize the port via an environment variable or direct argument
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port)