package matrix

import (
	"math"

	"gonum.org/v1/gonum/blas/blas64"
	"gonum.org/v1/gonum/lapack/lapack64"

	"interseguro/go-api/internal/apierror"
)

const MaxDimension = 256

type Matrix [][]float64
type QRResult struct {
	Q Matrix `json:"q"`
	R Matrix `json:"r"`
}

func Validate(originalMatrix Matrix) error {
	if len(originalMatrix) == 0 {
		return apierror.New(400, "INVALID_MATRIX", "Matrix must not be empty")
	}
	if len(originalMatrix[0]) == 0 {
		return apierror.New(400, "INVALID_MATRIX", "Rows must not be empty")
	}
	if len(originalMatrix) > MaxDimension || len(originalMatrix[0]) > MaxDimension {
		return apierror.New(413, "MATRIX_TOO_LARGE", "Matrix dimensions must not exceed 256")
	}
	for _, row := range originalMatrix {
		if len(row) == 0 {
			return apierror.New(400, "INVALID_MATRIX", "Rows must not be empty")
		}
		if len(row) != len(originalMatrix[0]) {
			return apierror.New(400, "INVALID_MATRIX", "All rows must have the same number of columns")
		}
		for _, value := range row {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return apierror.New(400, "INVALID_MATRIX", "All values must be finite numbers")
			}
		}
	}
	return nil
}

func zeros(rowCount, columnCount int) Matrix {
	result := make(Matrix, rowCount)
	for rowIndex := range result {
		result[rowIndex] = make([]float64, columnCount)
	}
	return result
}

// QR returns reduced Householder QR: Q is m×k, R is k×n, k=min(m,n).
// Gonum's LAPACK interface supports wide matrices as well as tall matrices.
func QR(originalMatrix Matrix) (result QRResult, err error) {
	if err = Validate(originalMatrix); err != nil {
		return result, err
	}
	defer func() {
		if recover() != nil {
			result = QRResult{}
			err = apierror.New(422, "QR_FAILED", "Unable to factorize matrix")
		}
	}()
	rowCount := len(originalMatrix)
	columnCount := len(originalMatrix[0])
	factorSize := min(rowCount, columnCount)
	scale := 0.0
	for _, row := range originalMatrix {
		for _, value := range row {
			scale = math.Max(scale, math.Abs(value))
		}
	}
	if scale == 0 {
		scale = 1
	}
	factorizationData := make([]float64, rowCount*columnCount)
	for rowIndex, row := range originalMatrix {
		for columnIndex, value := range row {
			factorizationData[rowIndex*columnCount+columnIndex] = value / scale
		}
	}
	factorizedMatrix := blas64.General{
		Rows:   rowCount,
		Cols:   columnCount,
		Stride: columnCount,
		Data:   factorizationData,
	}
	reflectorScales := make([]float64, factorSize)

	// LAPACK first reports the scratch buffer size needed for this matrix.
	workspace := make([]float64, 1)
	lapack64.Geqrf(factorizedMatrix, reflectorScales, workspace, -1)
	workspace = make([]float64, int(workspace[0]))
	lapack64.Geqrf(factorizedMatrix, reflectorScales, workspace, len(workspace))

	// Geqrf stores R above the diagonal and Householder reflectors below it.
	result.R = zeros(factorSize, columnCount)
	for rowIndex := 0; rowIndex < factorSize; rowIndex++ {
		for columnIndex := rowIndex; columnIndex < columnCount; columnIndex++ {
			result.R[rowIndex][columnIndex] = factorizationData[rowIndex*columnCount+columnIndex] * scale
		}
	}
	result.Q = buildQ(factorizedMatrix, reflectorScales)
	for _, factor := range []Matrix{result.Q, result.R} {
		for _, row := range factor {
			for _, value := range row {
				if math.IsNaN(value) || math.IsInf(value, 0) {
					return QRResult{}, apierror.New(422, "QR_FAILED", "QR result exceeds floating-point range")
				}
			}
		}
	}
	return result, nil
}

func buildQ(factorizedMatrix blas64.General, reflectorScales []float64) Matrix {
	rowCount := factorizedMatrix.Rows
	factorSize := len(reflectorScales)
	orthogonalData := make([]float64, rowCount*factorSize)
	for rowIndex := 0; rowIndex < rowCount; rowIndex++ {
		sourceOffset := rowIndex * factorizedMatrix.Stride
		destinationOffset := rowIndex * factorSize
		copy(orthogonalData[destinationOffset:destinationOffset+factorSize], factorizedMatrix.Data[sourceOffset:sourceOffset+factorSize])
	}
	orthogonalMatrix := blas64.General{
		Rows:   rowCount,
		Cols:   factorSize,
		Stride: factorSize,
		Data:   orthogonalData,
	}
	workspace := make([]float64, 1)
	lapack64.Orgqr(orthogonalMatrix, reflectorScales, workspace, -1)
	workspace = make([]float64, int(workspace[0]))
	lapack64.Orgqr(orthogonalMatrix, reflectorScales, workspace, len(workspace))
	result := zeros(rowCount, factorSize)
	for rowIndex := range result {
		rowOffset := rowIndex * factorSize
		copy(result[rowIndex], orthogonalData[rowOffset:rowOffset+factorSize])
	}
	return result
}

func Rotate(originalMatrix Matrix) (Matrix, error) {
	if err := Validate(originalMatrix); err != nil {
		return nil, err
	}
	rowCount := len(originalMatrix)
	columnCount := len(originalMatrix[0])
	rotatedMatrix := zeros(columnCount, rowCount)
	for rowIndex, row := range originalMatrix {
		for columnIndex, value := range row {
			rotatedMatrix[columnIndex][rowCount-1-rowIndex] = value
		}
	}
	return rotatedMatrix, nil
}
