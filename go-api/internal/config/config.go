package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port    string
	NodeURL string
	Timeout time.Duration
}

func Load() (Config, error) {
	port := os.Getenv("GO_PORT")
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" {
		port = "8080"
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return Config{}, fmt.Errorf("GO_PORT/PORT must be a valid port")
	}
	nodeURL := strings.TrimRight(os.Getenv("NODE_API_URL"), "/")
	parsedNodeURL, err := url.Parse(nodeURL)
	if err != nil ||
		parsedNodeURL.Host == "" ||
		(parsedNodeURL.Scheme != "http" && parsedNodeURL.Scheme != "https") ||
		parsedNodeURL.User != nil || parsedNodeURL.RawQuery != "" || parsedNodeURL.Fragment != "" {
		return Config{}, fmt.Errorf("NODE_API_URL must be an HTTP(S) URL without credentials, query or fragment")
	}
	timeoutValue := os.Getenv("HTTP_TIMEOUT_SECONDS")
	if timeoutValue == "" {
		timeoutValue = "5"
	}
	timeoutSeconds, err := strconv.Atoi(timeoutValue)
	if err != nil || timeoutSeconds < 1 || timeoutSeconds > 60 {
		return Config{}, fmt.Errorf("HTTP_TIMEOUT_SECONDS must be between 1 and 60")
	}
	return Config{
		Port:    port,
		NodeURL: nodeURL,
		Timeout: time.Duration(timeoutSeconds) * time.Second,
	}, nil
}
