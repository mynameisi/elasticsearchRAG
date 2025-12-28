#!/bin/bash
# Elasticsearch Cluster Configuration Script
# This script configures the Elasticsearch cluster for ML capabilities
# and deploys the ELSER v2 model for sparse vector embeddings.

ES_HOST="${ES_HOST:-http://localhost:9200}"
ES_USER="${ES_USER:-elastic}"
ES_PASSWORD="${ES_PASSWORD:-test123}"

echo "Waiting for Elasticsearch to be ready..."
until curl -s -u "${ES_USER}:${ES_PASSWORD}" "${ES_HOST}/_cluster/health" | grep -q '"status"'; do
    echo "Elasticsearch is not ready yet. Retrying in 5 seconds..."
    sleep 5
done
echo "Elasticsearch is ready!"

# Configure ML auto memory allocation
echo "Configuring ML auto memory allocation..."
curl -s -X PUT "${ES_HOST}/_cluster/settings" \
    -u "${ES_USER}:${ES_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d '{
        "persistent": {
            "xpack.ml.use_auto_machine_memory_percent": true
        }
    }'
echo ""

# Download and deploy ELSER v2 model
echo "Downloading ELSER v2 model..."
curl -s -X PUT "${ES_HOST}/_ml/trained_models/.elser_model_2?wait_for_completion=true" \
    -u "${ES_USER}:${ES_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d '{
        "input": {
            "field_names": ["text_field"]
        }
    }'
echo ""

# Start the ELSER model deployment
echo "Starting ELSER v2 model deployment..."
curl -s -X POST "${ES_HOST}/_ml/trained_models/.elser_model_2/deployment/_start?wait_for=started" \
    -u "${ES_USER}:${ES_PASSWORD}"
echo ""

echo "Elasticsearch configuration complete!"
