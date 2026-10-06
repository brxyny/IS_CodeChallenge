package statistics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"strings"
	"time"

	"interseguro/go-api/internal/apierror"
	"interseguro/go-api/internal/matrix"
)

const maxResponseBytes = 64 * 1024

type DiagonalResult struct {
	Q   bool `json:"q"`
	R   bool `json:"r"`
	Any bool `json:"any"`
}

type Result struct {
	Max      float64        `json:"max"`
	Min      float64        `json:"min"`
	Average  float64        `json:"average"`
	Sum      float64        `json:"sum"`
	Count    int            `json:"count"`
	Diagonal DiagonalResult `json:"diagonal"`
	Epsilon  float64        `json:"epsilon"`
}

type Client struct {
	URL  string
	HTTP *http.Client
}

func NewClient(url string, timeout time.Duration) *Client {
	return &Client{
		URL: strings.TrimRight(url, "/"),
		HTTP: &http.Client{
			Timeout: timeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (client *Client) Calculate(ctx context.Context, qrResult matrix.QRResult) (Result, error) {
	requestBody, err := json.Marshal(qrResult)
	if err != nil {
		return Result{}, apierror.New(500, "INTERNAL_ERROR", "Unable to prepare statistics request")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.URL+"/api/v1/statistics", bytes.NewReader(requestBody))
	if err != nil {
		return Result{}, apierror.New(500, "INTERNAL_ERROR", "Unable to prepare statistics request")
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.HTTP.Do(request)
	if err != nil {
		if isTimeout(err) {
			return Result{}, apierror.New(504, "NODE_TIMEOUT", "Statistics service timed out")
		}
		return Result{}, apierror.New(502, "NODE_UNAVAILABLE", "Statistics service is unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Result{}, apierror.New(502, "NODE_ERROR", "Statistics service returned an error")
	}
	if !strings.HasPrefix(response.Header.Get("Content-Type"), "application/json") {
		return Result{}, invalidResponse()
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil {
		if isTimeout(err) {
			return Result{}, apierror.New(504, "NODE_TIMEOUT", "Statistics service timed out")
		}
		return Result{}, invalidResponse()
	}
	expectedCount := len(qrResult.Q)*len(qrResult.Q[0]) + len(qrResult.R)*len(qrResult.R[0])
	return decodeStatistics(responseBody, expectedCount)
}

func isTimeout(err error) bool {
	var networkError net.Error
	return errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &networkError) && networkError.Timeout())
}

func invalidResponse() error {
	return apierror.New(502, "NODE_INVALID_RESPONSE", "Statistics service returned an invalid response")
}

func decodeStatistics(responseBody []byte, expectedCount int) (Result, error) {
	// Pointers distinguish missing/null fields from legitimate zero/false values.
	var payload struct {
		Max      *float64 `json:"max"`
		Min      *float64 `json:"min"`
		Average  *float64 `json:"average"`
		Sum      *float64 `json:"sum"`
		Count    *int     `json:"count"`
		Epsilon  *float64 `json:"epsilon"`
		Diagonal *struct {
			Q   *bool `json:"q"`
			R   *bool `json:"r"`
			Any *bool `json:"any"`
		} `json:"diagonal"`
	}
	if len(responseBody) > maxResponseBytes || json.Unmarshal(responseBody, &payload) != nil {
		return Result{}, invalidResponse()
	}
	if payload.Max == nil || payload.Min == nil || payload.Average == nil || payload.Sum == nil {
		return Result{}, invalidResponse()
	}
	if payload.Count == nil || payload.Epsilon == nil || payload.Diagonal == nil {
		return Result{}, invalidResponse()
	}
	diagonal := payload.Diagonal
	if diagonal.Q == nil || diagonal.R == nil || diagonal.Any == nil {
		return Result{}, invalidResponse()
	}
	if *payload.Count != expectedCount || *payload.Max < *payload.Min || *payload.Epsilon <= 0 {
		return Result{}, invalidResponse()
	}
	if *diagonal.Any != (*diagonal.Q || *diagonal.R) {
		return Result{}, invalidResponse()
	}
	for _, value := range []float64{*payload.Max, *payload.Min, *payload.Average, *payload.Sum, *payload.Epsilon} {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return Result{}, invalidResponse()
		}
	}
	return Result{
		Max:     *payload.Max,
		Min:     *payload.Min,
		Average: *payload.Average,
		Sum:     *payload.Sum,
		Count:   *payload.Count,
		Epsilon: *payload.Epsilon,
		Diagonal: DiagonalResult{
			Q:   *diagonal.Q,
			R:   *diagonal.R,
			Any: *diagonal.Any,
		},
	}, nil
}
