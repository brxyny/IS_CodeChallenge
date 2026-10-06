package matrix

import (
	"math"
	"math/rand"
	"reflect"
	"testing"
)

func verifyQR(t *testing.T, originalMatrix Matrix) {
	t.Helper()
	qr, err := QR(originalMatrix)
	if err != nil {
		t.Fatal(err)
	}
	rowCount, columnCount, factorSize := len(originalMatrix), len(originalMatrix[0]), min(len(originalMatrix), len(originalMatrix[0]))
	if len(qr.Q) != rowCount || len(qr.Q[0]) != factorSize || len(qr.R) != factorSize || len(qr.R[0]) != columnCount {
		t.Fatal("incorrect reduced QR dimensions")
	}
	scale := 0.0
	for _, row := range originalMatrix {
		for _, value := range row {
			scale = math.Max(scale, math.Abs(value))
		}
	}
	if scale == 0 {
		scale = 1
	}
	for i := 0; i < rowCount; i++ {
		for j := 0; j < columnCount; j++ {
			actual := 0.0
			for factorIndex := 0; factorIndex < factorSize; factorIndex++ {
				actual += qr.Q[i][factorIndex] * qr.R[factorIndex][j]
			}
			if math.Abs(actual/scale-originalMatrix[i][j]/scale) > 1e-10 {
				t.Fatalf("A != QR at %d,%d: %g != %g", i, j, originalMatrix[i][j], actual)
			}
		}
	}
	for i := 0; i < factorSize; i++ {
		for j := 0; j < factorSize; j++ {
			actual := 0.0
			for factorIndex := 0; factorIndex < rowCount; factorIndex++ {
				actual += qr.Q[factorIndex][i] * qr.Q[factorIndex][j]
			}
			want := 0.0
			if i == j {
				want = 1
			}
			if math.Abs(actual-want) > 1e-10 {
				t.Fatalf("Q^T Q != I: %g", actual)
			}
		}
	}
	for i := 0; i < factorSize; i++ {
		for j := 0; j < min(i, columnCount); j++ {
			if math.Abs(qr.R[i][j]) > 1e-10 {
				t.Fatal("R is not upper trapezoidal")
			}
		}
	}
}

func TestQR(t *testing.T) {
	cases := map[string]Matrix{
		"square": {{1, 2}, {3, 4}}, "tall": {{1, 2}, {3, 4}, {5, 6}}, "wide": {{1, 2, 3}, {4, 5, 6}},
		"negative": {{-1, -2}, {-3, -4}}, "decimal": {{0.1, 1.25}, {-2.75, 4.5}}, "singular": {{1, 2}, {2, 4}},
		"zero": {{0, 0}, {0, 0}}, "scalar": {{5}}, "row": {{1, 2, 3}}, "column": {{1}, {2}, {3}},
		"large": {{1e200, 2e200}, {-1e200, 3e200}}, "tiny": {{1e-200, 2e-200}, {3e-200, 4e-200}},
	}
	for name, originalMatrix := range cases {
		t.Run(name, func(t *testing.T) {
			before := make(Matrix, len(originalMatrix))
			for i := range originalMatrix {
				before[i] = append([]float64(nil), originalMatrix[i]...)
			}
			verifyQR(t, originalMatrix)
			if !reflect.DeepEqual(originalMatrix, before) {
				t.Fatal("input was mutated")
			}
		})
	}
}

func TestQRRandomShapes(t *testing.T) {
	randomGenerator := rand.New(rand.NewSource(42))
	for rowCount := 1; rowCount <= 12; rowCount++ {
		for columnCount := 1; columnCount <= 12; columnCount++ {
			originalMatrix := zeros(rowCount, columnCount)
			for i := range originalMatrix {
				for j := range originalMatrix[i] {
					originalMatrix[i][j] = randomGenerator.NormFloat64()
				}
			}
			verifyQR(t, originalMatrix)
		}
	}
}

func TestValidate(t *testing.T) {
	cases := []Matrix{nil, {}, {{}}, {{1}, {2, 3}}, {{1}, {}}, {{math.NaN()}}, {{math.Inf(1)}}, zeros(257, 1), zeros(1, 257)}
	for i, originalMatrix := range cases {
		if Validate(originalMatrix) == nil {
			t.Errorf("case %d accepted", i)
		}
		if _, err := QR(originalMatrix); err == nil {
			t.Errorf("QR accepted %d", i)
		}
		if _, err := Rotate(originalMatrix); err == nil {
			t.Errorf("rotation accepted %d", i)
		}
	}
	if err := Validate(Matrix{{-1, 0.25}, {2, 3}}); err != nil {
		t.Fatal(err)
	}
}

func TestRotate(t *testing.T) {
	for _, testCase := range []struct{ originalMatrix, want Matrix }{
		{Matrix{{1, 2}, {3, 4}}, Matrix{{3, 1}, {4, 2}}},
		{Matrix{{1, 2, 3}, {4, 5, 6}}, Matrix{{4, 1}, {5, 2}, {6, 3}}},
		{Matrix{{-1.5}, {2.25}}, Matrix{{2.25, -1.5}}},
	} {
		got, err := Rotate(testCase.originalMatrix)
		if err != nil || !reflect.DeepEqual(got, testCase.want) {
			t.Fatalf("rotate=%v err=%v", got, err)
		}
		restored := testCase.originalMatrix
		for i := 0; i < 4; i++ {
			restored, _ = Rotate(restored)
		}
		if !reflect.DeepEqual(restored, testCase.originalMatrix) {
			t.Fatal("4 rotations do not restore A")
		}
	}
}

func TestQROverflow(t *testing.T) {
	if _, err := QR(Matrix{{math.MaxFloat64}, {math.MaxFloat64}}); err == nil {
		t.Fatal("unrepresentable QR should fail cleanly")
	}
}
