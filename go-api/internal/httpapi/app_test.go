package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"interseguro/go-api/internal/apierror"
	"interseguro/go-api/internal/matrix"
	"interseguro/go-api/internal/statistics"
)

type stubStatistics struct {
	err   error
	panic bool
	calls int
}

func (s *stubStatistics) Calculate(_ context.Context, qr matrix.QRResult) (statistics.Result, error) {
	s.calls++
	if s.panic {
		panic("private implementation details")
	}
	if s.err != nil {
		return statistics.Result{}, s.err
	}
	return statistics.Result{Count: len(qr.Q)*len(qr.Q[0]) + len(qr.R)*len(qr.R[0])}, nil
}

func send(t *testing.T, app *fiber.App, path, body string) (int, map[string]json.RawMessage) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := app.Test(req, 3000)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var data map[string]json.RawMessage
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, data
}

func TestRoutes(t *testing.T) {
	service := &stubStatistics{}
	app := NewApp(service)
	for _, path := range []string{"/api/v1/matrices/qr", "/api/v1/matrices/rotate", "/api/v1/process"} {
		status, body := send(t, app, path, `{"matrix":[[1,2],[3,4]]}`)
		if status != 200 || body["error"] != nil {
			t.Fatalf("%s status=%d body=%v", path, status, body)
		}
	}
	if service.calls != 1 {
		t.Fatal("only process should contact Node")
	}
	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/health", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal(res.StatusCode)
	}
}

func TestInvalidRequests(t *testing.T) {
	service := &stubStatistics{}
	app := NewApp(service)
	cases := []struct {
		body, code string
		status     int
	}{
		{`{`, "INVALID_JSON", 400}, {`{"matrix":[[NaN]]}`, "INVALID_JSON", 400},
		{`[]`, "INVALID_INPUT", 400}, {`null`, "INVALID_INPUT", 400}, {`{}`, "INVALID_INPUT", 400},
		{`{"matrix":[],"extra":1}`, "INVALID_INPUT", 400}, {`{"matrix":[]}`, "INVALID_MATRIX", 400},
		{`{"matrix":[[]]}`, "INVALID_MATRIX", 400}, {`{"matrix":[[1],[2,3]]}`, "INVALID_MATRIX", 400},
		{`{"matrix":[[null]]}`, "INVALID_MATRIX", 400}, {`{"matrix":[["1"]]}`, "INVALID_MATRIX", 400},
		{`{"matrix":[[true]]}`, "INVALID_MATRIX", 400}, {`{"matrix":[null]}`, "INVALID_MATRIX", 400},
		{`{"matrix":"hello"}`, "INVALID_MATRIX", 400}, {`{"matrix":[[1e400]]}`, "INVALID_MATRIX", 400},
		{`{"matrix":[[1.7976931348623157e308],[1.7976931348623157e308]]}`, "QR_FAILED", 422},
	}
	for _, tc := range cases {
		t.Run(tc.body, func(t *testing.T) {
			status, body := send(t, app, "/api/v1/process", tc.body)
			var public apierror.Error
			if err := json.Unmarshal(body["error"], &public); err != nil {
				t.Fatal(err)
			}
			if status != tc.status || public.Code != tc.code {
				t.Fatalf("status=%d error=%+v", status, public)
			}
		})
	}
	if service.calls != 0 {
		t.Fatal("invalid input must not call Node")
	}
}

func TestConsistentHTTPFailures(t *testing.T) {
	for _, err := range []error{apierror.New(502, "NODE_UNAVAILABLE", "Statistics service is unavailable"), apierror.New(504, "NODE_TIMEOUT", "Statistics service timed out"), errors.New("secret error")} {
		app := NewApp(&stubStatistics{err: err})
		status, body := send(t, app, "/api/v1/process", `{"matrix":[[1]]}`)
		if status < 500 || strings.Contains(string(body["error"]), "secret") {
			t.Fatal(status, body)
		}
	}
	app := NewApp(&stubStatistics{panic: true})
	status, body := send(t, app, "/api/v1/process", `{"matrix":[[1]]}`)
	if status != 500 || strings.Contains(string(body["error"]), "private") {
		t.Fatal(status, body)
	}
}

func TestBodyLimitContentTypeAndNotFound(t *testing.T) {
	app := NewApp(&stubStatistics{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/process", strings.NewReader(`{"matrix":[[1]]}`))
	req.Header.Set("Content-Type", "text/plain")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 415 {
		t.Fatal(res.StatusCode)
	}
	// Fiber's in-memory Test reports parser-level body limits as transport errors.
	// Check the actual HTTP response over TCP instead.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	finished := make(chan error, 1)
	go func() { finished <- app.Listener(listener) }()
	defer func() { _ = app.ShutdownWithTimeout(time.Second); <-finished }()
	conn, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Second))
	// Read the early rejection before transmitting an already rejected body.
	_, err = io.WriteString(conn, "POST /api/v1/process HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1048577\r\nConnection: close\r\n\r\n")
	if err != nil {
		t.Fatal(err)
	}
	large, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	largeBody, _ := io.ReadAll(large.Body)
	large.Body.Close()
	if large.StatusCode != 413 || !strings.Contains(string(largeBody), "PAYLOAD_TOO_LARGE") {
		t.Fatal(large.StatusCode, string(largeBody))
	}
	res, err = app.Test(httptest.NewRequest(http.MethodGet, "/missing", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != 404 || !strings.Contains(string(data), "NOT_FOUND") {
		t.Fatal(string(data))
	}
}
