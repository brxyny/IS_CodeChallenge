package statistics

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"interseguro/go-api/internal/apierror"
	"interseguro/go-api/internal/matrix"
)

const validResponse = `{"max":2,"min":1,"average":1.5,"sum":3,"count":2,"diagonal":{"q":true,"r":true,"any":true},"epsilon":1e-10}`

var input = matrix.QRResult{Q: matrix.Matrix{{1}}, R: matrix.Matrix{{2}}}

func assertCode(t *testing.T, err error, want string) {
	t.Helper()
	public, ok := err.(*apierror.Error)
	if !ok || public.Code != want {
		t.Fatalf("want %s, got %v", want, err)
	}
}

func TestClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/statistics" || r.Header.Get("Content-Type") != "application/json" {
			t.Error("incorrect request")
		}
		var received matrix.QRResult
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil || len(received.Q) != 1 {
			t.Error("incorrect payload")
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, validResponse)
	}))
	defer server.Close()
	result, err := NewClient(server.URL, time.Second).Calculate(context.Background(), input)
	if err != nil || result.Sum != 3 {
		t.Fatal(result, err)
	}
}

func TestClientFailures(t *testing.T) {
	for _, tc := range []struct {
		name, body, contentType, code string
		status                        int
		delay                         time.Duration
	}{
		{"server error", "", "application/json", "NODE_ERROR", 500, 0},
		{"redirect", "", "application/json", "NODE_ERROR", 302, 0},
		{"invalid JSON", "{", "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"missing fields", "{}", "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"null field", strings.Replace(validResponse, `"sum":3`, `"sum":null`, 1), "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"wrong count", strings.Replace(validResponse, `"count":2`, `"count":3`, 1), "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"wrong diagonal", strings.Replace(validResponse, `"any":true`, `"any":false`, 1), "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"non JSON", validResponse, "text/plain", "NODE_INVALID_RESPONSE", 200, 0},
		{"too large", strings.Repeat(" ", 65537), "application/json", "NODE_INVALID_RESPONSE", 200, 0},
		{"timeout", validResponse, "application/json", "NODE_TIMEOUT", 200, 100 * time.Millisecond},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				time.Sleep(tc.delay)
				w.Header().Set("Content-Type", tc.contentType)
				w.WriteHeader(tc.status)
				io.WriteString(w, tc.body)
			}))
			defer server.Close()
			_, err := NewClient(server.URL, 30*time.Millisecond).Calculate(context.Background(), input)
			assertCode(t, err, tc.code)
		})
	}
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	server.Close()
	_, err := NewClient(server.URL, time.Second).Calculate(context.Background(), input)
	assertCode(t, err, "NODE_UNAVAILABLE")
}
