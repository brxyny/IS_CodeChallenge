package config

import "testing"

func TestLoad(t *testing.T) {
	t.Setenv("NODE_API_URL", "http://node-api:3000/")
	t.Setenv("GO_PORT", "")
	t.Setenv("PORT", "")
	t.Setenv("HTTP_TIMEOUT_SECONDS", "")
	cfg, err := Load()
	if err != nil || cfg.Port != "8080" || cfg.NodeURL != "http://node-api:3000" || cfg.Timeout.Seconds() != 5 {
		t.Fatal(cfg, err)
	}
	t.Setenv("PORT", "9090")
	cfg, err = Load()
	if err != nil || cfg.Port != "9090" {
		t.Fatal(cfg, err)
	}
	t.Setenv("GO_PORT", "8081")
	cfg, err = Load()
	if err != nil || cfg.Port != "8081" {
		t.Fatal(cfg, err)
	}
}

func TestInvalidConfig(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"GO_PORT", "bad"}, {"GO_PORT", "0"}, {"GO_PORT", "65536"},
		{"NODE_API_URL", ""}, {"NODE_API_URL", "ftp://host"}, {"NODE_API_URL", "http://user:pass@host"}, {"NODE_API_URL", "http://host?token=secret"},
		{"HTTP_TIMEOUT_SECONDS", "0"}, {"HTTP_TIMEOUT_SECONDS", "61"}, {"HTTP_TIMEOUT_SECONDS", "x"},
	} {
		t.Run(tc.key+tc.value, func(t *testing.T) {
			t.Setenv("GO_PORT", "8080")
			t.Setenv("NODE_API_URL", "http://localhost:3000")
			t.Setenv("HTTP_TIMEOUT_SECONDS", "5")
			t.Setenv(tc.key, tc.value)
			if _, err := Load(); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}
