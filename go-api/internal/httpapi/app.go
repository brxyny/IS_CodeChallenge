package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"mime"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"interseguro/go-api/internal/apierror"
	"interseguro/go-api/internal/matrix"
	"interseguro/go-api/internal/statistics"
)

type StatisticsService interface {
	Calculate(context.Context, matrix.QRResult) (statistics.Result, error)
}

func parseMatrix(ctx *fiber.Ctx) (matrix.Matrix, error) {
	if encoding := ctx.Get("Content-Encoding"); encoding != "" && encoding != "identity" {
		return nil, apierror.New(415, "UNSUPPORTED_MEDIA_TYPE", "Compressed request bodies are not supported")
	}
	mediaType, _, err := mime.ParseMediaType(ctx.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return nil, apierror.New(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json")
	}
	if !json.Valid(ctx.Body()) {
		return nil, apierror.New(400, "INVALID_JSON", "Request body must be valid JSON")
	}
	var requestFields map[string]json.RawMessage
	if json.Unmarshal(ctx.Body(), &requestFields) != nil || requestFields == nil {
		return nil, apierror.New(400, "INVALID_INPUT", "Expected an object with a matrix field")
	}
	if len(requestFields) != 1 || requestFields["matrix"] == nil {
		return nil, apierror.New(400, "INVALID_INPUT", "Expected only a matrix field")
	}
	var rawRows []json.RawMessage
	if json.Unmarshal(requestFields["matrix"], &rawRows) != nil {
		return nil, apierror.New(400, "INVALID_MATRIX", "Matrix must be an array of arrays of finite numbers")
	}
	originalMatrix := make(matrix.Matrix, len(rawRows))
	for rowIndex, row := range rawRows {
		var rawValues []json.RawMessage
		if json.Unmarshal(row, &rawValues) != nil || rawValues == nil {
			return nil, apierror.New(400, "INVALID_MATRIX", "Every row must be an array")
		}
		originalMatrix[rowIndex] = make([]float64, len(rawValues))
		for columnIndex, value := range rawValues {
			if string(value) == "null" || json.Unmarshal(value, &originalMatrix[rowIndex][columnIndex]) != nil {
				return nil, apierror.New(400, "INVALID_MATRIX", "All values must be finite numbers")
			}
		}
	}
	return originalMatrix, matrix.Validate(originalMatrix)
}

func NewApp(statisticsService StatisticsService) *fiber.App {
	app := fiber.New(fiber.Config{
		BodyLimit:             1024 * 1024,
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          70 * time.Second,
		IdleTimeout:           30 * time.Second,
		DisableStartupMessage: true,
		ErrorHandler:          handleError,
	})
	app.Use(recover.New())
	app.Use(func(ctx *fiber.Ctx) error {
		ctx.Set("X-Content-Type-Options", "nosniff")
		return ctx.Next()
	})
	app.Get("/health", func(ctx *fiber.Ctx) error {
		return ctx.JSON(fiber.Map{"status": "ok", "service": "go-api"})
	})
	app.Post("/api/v1/matrices/qr", func(ctx *fiber.Ctx) error {
		originalMatrix, err := parseMatrix(ctx)
		if err != nil {
			return err
		}
		qrResult, err := matrix.QR(originalMatrix)
		if err != nil {
			return err
		}
		return ctx.JSON(qrResult)
	})
	app.Post("/api/v1/matrices/rotate", func(ctx *fiber.Ctx) error {
		originalMatrix, err := parseMatrix(ctx)
		if err != nil {
			return err
		}
		rotatedMatrix, err := matrix.Rotate(originalMatrix)
		if err != nil {
			return err
		}
		return ctx.JSON(fiber.Map{"rotation": rotatedMatrix, "degrees": 90, "direction": "clockwise"})
	})
	app.Post("/api/v1/process", func(ctx *fiber.Ctx) error {
		originalMatrix, err := parseMatrix(ctx)
		if err != nil {
			return err
		}
		qrResult, err := matrix.QR(originalMatrix)
		if err != nil {
			return err
		}
		rotatedMatrix, err := matrix.Rotate(originalMatrix)
		if err != nil {
			return err
		}
		matrixStatistics, err := statisticsService.Calculate(ctx.UserContext(), qrResult)
		if err != nil {
			return err
		}
		return ctx.JSON(fiber.Map{
			"q":          qrResult.Q,
			"r":          qrResult.R,
			"rotation":   rotatedMatrix,
			"statistics": matrixStatistics,
		})
	})
	return app
}

func handleError(ctx *fiber.Ctx, err error) error {
	var publicError *apierror.Error
	if !errors.As(err, &publicError) {
		publicError = apierror.New(500, "INTERNAL_ERROR", "An internal error occurred")
		var fiberErr *fiber.Error
		if errors.As(err, &fiberErr) {
			switch fiberErr.Code {
			case 413:
				publicError = apierror.New(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 1 MiB")
			case 404:
				publicError = apierror.New(404, "NOT_FOUND", "Route not found")
			case 405:
				publicError = apierror.New(405, "METHOD_NOT_ALLOWED", "Method not allowed")
			}
		}
	}
	if publicError.Status >= 500 {
		slog.Error("request failed", "code", publicError.Code, "path", ctx.Path())
	}
	return ctx.Status(publicError.Status).JSON(fiber.Map{"error": publicError})
}
