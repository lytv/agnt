#!/bin/bash

# =============================================================================
# AGNT Webhook Test Script
# =============================================================================
# Test local webhook integration with Cloudflare Tunnel
#
# Usage:
#   ./test-webhook.sh <workflowId> [base-url]
#
# Examples:
#   ./test-webhook.sh abc-123                              # Local test
#   ./test-webhook.sh abc-123 https://xyz.trycloudflare.com  # Tunnel test
#
# =============================================================================

WORKFLOW_ID=${1:-"test-workflow-id"}
BASE_URL=${2:-"http://localhost:3333"}

echo "=============================================="
echo "  AGNT Webhook Test Script"
echo "=============================================="
echo ""
echo "Workflow ID: $WORKFLOW_ID"
echo "Base URL:    $BASE_URL"
echo "Endpoint:    ${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}"
echo ""

# -----------------------------------------------------------------------------
# Test 1: Basic POST with JSON body
# -----------------------------------------------------------------------------
echo "----------------------------------------------"
echo "Test 1: POST with JSON body"
echo "----------------------------------------------"
curl -X POST \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"Hello from webhook\", \"timestamp\": \"$(date +%s)\", \"test\": 1}" \
  "${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -s
echo ""

# -----------------------------------------------------------------------------
# Test 2: GET with query parameters
# -----------------------------------------------------------------------------
echo "----------------------------------------------"
echo "Test 2: GET with query parameters"
echo "----------------------------------------------"
curl -X GET \
  "${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}?foo=bar&count=123" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -s
echo ""

# -----------------------------------------------------------------------------
# Test 3: POST with Bearer token authentication
# -----------------------------------------------------------------------------
echo "----------------------------------------------"
echo "Test 3: POST with Bearer auth (replace token)"
echo "----------------------------------------------"
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token-here" \
  -d "{\"authenticated\": true, \"test\": 3}" \
  "${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -s
echo ""

# -----------------------------------------------------------------------------
# Test 4: POST with Basic authentication
# -----------------------------------------------------------------------------
echo "----------------------------------------------"
echo "Test 4: POST with Basic auth (user:pass)"
echo "----------------------------------------------"
curl -X POST \
  -H "Content-Type: application/json" \
  -u "testuser:testpassword" \
  -d "{\"auth_type\": \"basic\", \"test\": 4}" \
  "${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -s
echo ""

# -----------------------------------------------------------------------------
# Test 5: POST with form data
# -----------------------------------------------------------------------------
echo "----------------------------------------------"
echo "Test 5: POST with form data"
echo "----------------------------------------------"
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=John&email=john@example.com&test=5" \
  "${BASE_URL}/api/webhooks/trigger/${WORKFLOW_ID}" \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -s
echo ""

echo "=============================================="
echo "  Tests Complete"
echo "=============================================="
echo ""
echo "Expected Results:"
echo "  - 200: Webhook processed successfully"
echo "  - 401: Unauthorized (auth required/invalid)"
echo "  - 404: Webhook not found or workflow not ready"
echo "  - 405: Method not allowed"
echo ""
echo "Tips:"
echo "  - Ensure the workflow is RUNNING before testing"
echo "  - Check backend console for detailed logs"
echo "  - Use tunnel URL for external testing"
echo ""
