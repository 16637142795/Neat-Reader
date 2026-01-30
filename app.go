package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx    context.Context
	config *Config
}

type Config struct {
	Port int
}

func NewApp() *App {
	return &App{
		config: &Config{
			Port: 3001,
		},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	log.Println("Neat Reader starting...")
}

func (a *App) shutdown(ctx context.Context) {
	log.Println("Neat Reader shutting down...")
}

func (a *App) GetHealth() string {
	return `{"status": "ok"}`
}

func (a *App) GetConfig() *Config {
	return a.config
}

func (a *App) UploadFile(fileName string, fileData []byte, accessToken string) string {
	uploadURL := "https://pan.baidu.com/rest/2.0/xpan/file?method=upload&access_token=" + accessToken

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	part.Write(fileData)
	writer.Close()

	req, err := http.NewRequest("POST", uploadURL, body)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return string(respBody)
}

func (a *App) VerifyToken(accessToken string) string {
	infoURL := "https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&access_token=" + accessToken
	resp, err := http.Get(infoURL)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) GetFileList(accessToken string, dir string, pageNum int, pageSize int, order string, method string, recursion int) string {
	params := url.Values{}
	params.Set("access_token", accessToken)
	params.Set("dir", dir)
	params.Set("pageNum", fmt.Sprintf("%d", pageNum))
	params.Set("pageSize", fmt.Sprintf("%d", pageSize))
	params.Set("order", order)
	params.Set("method", method)
	params.Set("recursion", fmt.Sprintf("%d", recursion))

	fileURL := "https://pan.baidu.com/rest/2.0/xpan/file?" + params.Encode()
	resp, err := http.Get(fileURL)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) SearchFiles(accessToken string, key string, dir string, method string, recursion int) string {
	params := url.Values{}
	params.Set("access_token", accessToken)
	params.Set("key", key)
	params.Set("dir", dir)
	params.Set("method", method)
	params.Set("recursion", fmt.Sprintf("%d", recursion))

	searchURL := "https://pan.baidu.com/rest/2.0/xpan/file?" + params.Encode()
	resp, err := http.Get(searchURL)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) GetTokenViaCode(code string, clientId string, clientSecret string, redirectUri string) string {
	tokenURL := "https://openapi.baidu.com/oauth/2.0/token"
	params := url.Values{}
	params.Set("grant_type", "authorization_code")
	params.Set("code", code)
	params.Set("client_id", clientId)
	params.Set("client_secret", clientSecret)
	params.Set("redirect_uri", redirectUri)

	resp, err := http.PostForm(tokenURL, params)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) RefreshToken(refreshToken string, clientId string, clientSecret string) string {
	tokenURL := "https://openapi.baidu.com/oauth/2.0/token"
	params := url.Values{}
	params.Set("grant_type", "refresh_token")
	params.Set("refresh_token", refreshToken)
	params.Set("client_id", clientId)
	params.Set("client_secret", clientSecret)

	resp, err := http.PostForm(tokenURL, params)
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) GetTokenViaAlist(alistUrl string, username string, password string) string {
	loginURL := alistUrl + "/api/auth/login"
	params := map[string]string{
		"username": username,
		"password": password,
	}
	jsonData, _ := json.Marshal(params)

	resp, err := http.Post(loginURL, "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return string(body)
}

func (a *App) OpenDirectory() string {
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择文件夹",
	})
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	if path == "" {
		return `{"path": ""}`
	}
	return fmt.Sprintf(`{"path": "%s"}`, path)
}

func (a *App) ReadFile(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Printf("Error reading file: %v", err)
		return nil
	}
	return data
}

func (a *App) SelectFile() string {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "选择文件",
	})
	if err != nil {
		return fmt.Sprintf(`{"error": "%v"}`, err)
	}
	if filePath == "" {
		return `{"path": ""}`
	}
	return fmt.Sprintf(`{"path": "%s"}`, filePath)
}
