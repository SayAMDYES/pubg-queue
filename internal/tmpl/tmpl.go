package tmpl

import (
	"embed"
	"fmt"
	"html/template"
	"net/http"
)

//go:embed *.html
var files embed.FS

var templates *template.Template

func init() {
	funcMap := template.FuncMap{
		"nseq": func(n int) []int {
			seq := make([]int, n)
			for i := range seq {
				seq[i] = i
			}
			return seq
		},
		"mul": func(a, b int) int {
			return a * b
		},
	}

	var err error
	templates, err = template.New("").Funcs(funcMap).ParseFS(files, "*.html")
	if err != nil {
		panic(fmt.Sprintf("parse templates: %v", err))
	}
}

func Render(w http.ResponseWriter, name string, data interface{}) error {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	t := templates.Lookup(name)
	if t == nil {
		return fmt.Errorf("template %q not found", name)
	}
	return t.Execute(w, data)
}
