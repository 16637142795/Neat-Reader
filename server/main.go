package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const (
	Port      = 3001
	AppName   = "Neat Reader"
	ChunkSize = 4 * 1024 * 1024 // 4MB
)

// 百度网盘API配置
var (
	ClientID     = "your_app_key"                   // 用户自己的百度网盘App Key
	ClientSecret = "your_client_secret"             // 用户自己的百度网盘App Secret
	RedirectURI  = "http://localhost:8080/callback" // 本地8080端口回调地址
)

type UploadRequest struct {
	AccessToken string `json:"accessToken"`
	Path        string `json:"path"` // 相对路径，如 "禅非一枝花.epub"
}

type PrecreateResponse struct {
	Path       string        `json:"path"`
	Uploadid   string        `json:"uploadid"`
	ReturnType int           `json:"return_type"`
	BlockList  []interface{} `json:"block_list"`
	Errno      int           `json:"errno"`
	RequestID  int64         `json:"request_id"`
}

type ChunkUploadResponse struct {
	MD5       string `json:"md5"`
	PartSeq   string `json:"partseq"`
	RequestID int64  `json:"request_id"`
}

type CreateResponse struct {
	Path  string `json:"path"`
	Errno int    `json:"errno"`
}

type TokenResponse struct {
	AccessToken      string `json:"access_token"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshToken     string `json:"refresh_token"`
	Scope            string `json:"scope"`
	SessionKey       string `json:"session_key"`
	SessionSecret    string `json:"session_secret"`
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description"`
}

type AlistTokenResponse struct {
	Success bool `json:"success"`
	Data    struct {
		RefreshToken string `json:"refresh_token"`
		AccessToken  string `json:"access_token"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
	} `json:"data"`
	Message string `json:"message"`
}

type VerifyResponse struct {
	Valid bool `json:"valid"`
	User  struct {
		BaiduName   string `json:"baidu_name"`
		NetdiskName string `json:"netdisk_name"`
		AvatarUrl   string `json:"avatar_url"`
		VipType     int    `json:"vip_type"`
		UK          int64  `json:"uk"`
	} `json:"user"`
	Message string `json:"message"`
}

type FileListResponse struct {
	List     []FileInfo `json:"list"`
	Errno    int        `json:"errno"`
	ErrorMsg string     `json:"error_msg"`
}

type FileInfo struct {
	FsId           int64  `json:"fs_id"`
	Path           string `json:"path"`
	ServerFilename string `json:"server_filename"`
	Size           int64  `json:"size"`
	Mtime          int64  `json:"mtime"`
	Ctime          int64  `json:"ctime"`
	IsDir          int    `json:"isdir"`
	Category       int    `json:"category"`
	FileType       string `json:"file_type"`
	MD5            string `json:"md5"`
}

type SearchResponse struct {
	List     []FileInfo `json:"list"`
	Errno    int        `json:"errno"`
	ErrorMsg string     `json:"error_msg"`
	Total    int        `json:"total"`
}

func calculateMD5(data []byte) string {
	hash := md5.Sum(data)
	return fmt.Sprintf("%x", hash)
}

func calculateFileMD5(file *os.File) (string, error) {
	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func getUploadDomain(accessToken, filePath string) (string, error) {
	baiduPath := getBaiduPath(filePath)
	fmt.Printf("[LocateUpload] 百度路径: %s\n", baiduPath)

	locateUrl := fmt.Sprintf("https://d.pcs.baidu.com/rest/2.0/pcs/file?method=locateupload&appid=250528&access_token=%s&path=%s&upload_version=2.0&uploadid=temp", accessToken, url.QueryEscape(baiduPath))

	fmt.Printf("[LocateUpload] 请求URL: %s\n", locateUrl)

	resp, err := http.Get(locateUrl)
	if err != nil {
		fmt.Printf("[LocateUpload] HTTP请求错误: %v\n", err)
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[LocateUpload] 读取响应失败: %v\n", err)
		return "", err
	}

	fmt.Printf("[LocateUpload] 原始响应: %s\n", string(body))

	var locateResp struct {
		Servers []struct {
			Server string `json:"server"`
		} `json:"servers"`
		ErrorCode int    `json:"error_code"`
		ErrorMsg  string `json:"error_msg"`
	}

	if err := json.Unmarshal(body, &locateResp); err != nil {
		fmt.Printf("[LocateUpload] 解析响应失败: %v\n", err)
		return "", err
	}

	if locateResp.ErrorCode != 0 {
		fmt.Printf("[LocateUpload] 获取域名失败，error_code: %d, error_msg: %s\n", locateResp.ErrorCode, locateResp.ErrorMsg)
		return "", fmt.Errorf("locate upload failed: error_code=%d, error_msg=%s", locateResp.ErrorCode, locateResp.ErrorMsg)
	}

	if len(locateResp.Servers) == 0 {
		fmt.Printf("[LocateUpload] 响应中没有服务器列表\n")
		return "", fmt.Errorf("no servers in response")
	}

	uploadDomain := locateResp.Servers[0].Server
	fmt.Printf("[LocateUpload] 获取上传域名成功: %s\n", uploadDomain)
	return uploadDomain, nil
}

func singleUpload(accessToken, filePath string, file *os.File) error {
	baiduPath := getBaiduPath(filePath)
	fmt.Printf("[SingleUpload] 百度路径: %s\n", baiduPath)

	uploadDomain, err := getUploadDomain(accessToken, filePath)
	if err != nil {
		fmt.Printf("[SingleUpload] 获取上传域名失败: %v\n", err)
		return err
	}

	uploadUrl := fmt.Sprintf("%s/rest/2.0/pcs/file?method=upload&access_token=%s&path=%s&ondup=overwrite", uploadDomain, accessToken, url.QueryEscape(baiduPath))

	fmt.Printf("[SingleUpload] 请求URL: %s\n", uploadUrl)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "upload")
	if err != nil {
		fmt.Printf("[SingleUpload] 创建表单文件失败: %v\n", err)
		return err
	}
	if _, err := io.Copy(part, file); err != nil {
		fmt.Printf("[SingleUpload] 写入表单文件失败: %v\n", err)
		return err
	}
	writer.Close()

	resp, err := http.Post(uploadUrl, writer.FormDataContentType(), body)
	if err != nil {
		fmt.Printf("[SingleUpload] HTTP请求错误: %v\n", err)
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[SingleUpload] 读取响应失败: %v\n", err)
		return err
	}

	fmt.Printf("[SingleUpload] 原始响应: %s\n", string(respBody))

	var errorResp struct {
		ErrorCode int    `json:"error_code"`
		ErrorMsg  string `json:"error_msg"`
	}

	if err := json.Unmarshal(respBody, &errorResp); err == nil && errorResp.ErrorCode != 0 {
		fmt.Printf("[SingleUpload] 上传失败，error_code: %d, error_msg: %s\n", errorResp.ErrorCode, errorResp.ErrorMsg)
		return fmt.Errorf("upload failed: error_code=%d, error_msg=%s", errorResp.ErrorCode, errorResp.ErrorMsg)
	}

	var successResp struct {
		Path      string `json:"path"`
		Size      int64  `json:"size"`
		MD5       string `json:"md5"`
		FsId      int64  `json:"fs_id"`
		RequestId int64  `json:"request_id"`
	}

	if err := json.Unmarshal(respBody, &successResp); err != nil {
		fmt.Printf("[SingleUpload] 解析成功响应失败: %v\n", err)
		return err
	}

	fmt.Printf("[SingleUpload] 上传成功，path: %s, size: %d, md5: %s, request_id: %d\n", successResp.Path, successResp.Size, successResp.MD5, successResp.RequestId)
	return nil
}

func getBaiduPath(relativePath string) string {
	cleanPath := strings.TrimPrefix(relativePath, "/")
	if cleanPath == "" {
		return fmt.Sprintf("/apps/%s", AppName)
	}
	return fmt.Sprintf("/apps/%s/%s", AppName, cleanPath)
}

func xpanfileprecreate(accessToken, filePath string, fileSize int64, blockList string) (*PrecreateResponse, error) {
	baiduPath := getBaiduPath(filePath)
	fmt.Printf("[Precreate] 原始路径: %s, 百度路径: %s, 大小: %d\n", filePath, baiduPath, fileSize)

	precreateUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/file?method=precreate&access_token=%s", accessToken)

	form := url.Values{}
	form.Set("path", baiduPath)
	form.Set("isdir", "0")
	form.Set("size", fmt.Sprintf("%d", fileSize))
	form.Set("autoinit", "1")
	form.Set("block_list", blockList)
	form.Set("rtype", "1")
	form.Set("ondup", "overwrite")

	fmt.Printf("[Precreate] 请求URL: %s\n", precreateUrl)
	fmt.Printf("[Precreate] 请求参数: path=%s, isdir=0, size=%d, autoinit=1, block_list=%s, rtype=1, ondup=overwrite\n", baiduPath, fileSize, blockList)

	resp, err := http.Post(precreateUrl, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		fmt.Printf("[Precreate] HTTP请求错误: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[Precreate] 读取响应失败: %v\n", err)
		return nil, err
	}

	fmt.Printf("[Precreate] 原始响应: %s\n", string(body))

	var precreateResp PrecreateResponse
	if err := json.Unmarshal(body, &precreateResp); err != nil {
		fmt.Printf("[Precreate] 解析JSON失败: %v\n", err)
		return nil, err
	}

	fmt.Printf("[Precreate] 成功: uploadid=%s, errno=%d\n", precreateResp.Uploadid, precreateResp.Errno)

	return &precreateResp, nil
}

func pcssuperfile2(accessToken, filePath, uploadid, partseq string, file *os.File) (*ChunkUploadResponse, error) {
	baiduPath := getBaiduPath(filePath)
	fmt.Printf("[Upload] 路径: %s, uploadid: %s, partseq: %s\n", baiduPath, uploadid, partseq)

	reqUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/file?method=upload&access_token=%s", accessToken)

	fmt.Printf("[Upload] 请求URL: %s\n", reqUrl)
	fmt.Printf("[Upload] 请求参数: path=%s, uploadid=%s, partseq=%s, type=tmpfile\n", baiduPath, uploadid, partseq)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("path", baiduPath)
	writer.WriteField("uploadid", uploadid)
	writer.WriteField("partseq", partseq)
	writer.WriteField("type", "tmpfile")

	part, err := writer.CreateFormFile("file", "chunk")
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, err
	}
	writer.Close()

	resp, err := http.Post(reqUrl, writer.FormDataContentType(), body)
	if err != nil {
		fmt.Printf("[Upload] HTTP请求错误: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[Upload] 读取响应失败: %v\n", err)
		return nil, err
	}

	fmt.Printf("[Upload] 原始响应: %s\n", string(respBody))

	var uploadResp ChunkUploadResponse
	if err := json.Unmarshal(respBody, &uploadResp); err != nil {
		fmt.Printf("[Upload] 解析JSON失败: %v\n", err)
		return &ChunkUploadResponse{PartSeq: partseq}, nil
	}

	return &uploadResp, nil
}

func xpanfilecreate(accessToken, filePath, uploadid string, fileSize int64, blockList string) (*CreateResponse, error) {
	baiduPath := getBaiduPath(filePath)
	fmt.Printf("[Create] 路径: %s, uploadid: %s, 大小: %d\n", baiduPath, uploadid, fileSize)

	reqUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=%s", accessToken)

	form := url.Values{}
	form.Set("path", baiduPath)
	form.Set("isdir", "0")
	form.Set("size", fmt.Sprintf("%d", fileSize))
	form.Set("uploadid", uploadid)
	form.Set("block_list", blockList)
	form.Set("rtype", "1")
	form.Set("ondup", "overwrite")

	fmt.Printf("[Create] 请求URL: %s\n", reqUrl)
	fmt.Printf("[Create] 请求参数: path=%s, isdir=0, size=%d, uploadid=%s, block_list=%s, rtype=1, ondup=overwrite\n", baiduPath, fileSize, uploadid, blockList)

	resp, err := http.Post(reqUrl, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		fmt.Printf("[Create] HTTP请求错误: %v\n", err)
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[Create] 读取响应失败: %v\n", err)
		return nil, err
	}

	fmt.Printf("[Create] 原始响应: %s\n", string(respBody))

	var createResp CreateResponse
	if err := json.Unmarshal(respBody, &createResp); err != nil {
		fmt.Printf("[Create] 解析JSON失败: %v\n", err)
		return nil, err
	}

	fmt.Printf("[Create] 成功: errno=%d\n", createResp.Errno)

	return &createResp, nil
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(100 << 20)
	if err != nil {
		fmt.Printf("[Upload] 解析表单失败: %v\n", err)
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	accessToken := r.FormValue("accessToken")
	if accessToken == "" {
		http.Error(w, "Missing accessToken", http.StatusBadRequest)
		return
	}

	relativePath := r.FormValue("path")
	fmt.Printf("[Upload] 相对路径: '%s'\n", relativePath)

	file, header, err := r.FormFile("file")
	if err != nil {
		fmt.Printf("[Upload] 获取文件失败: %v\n", err)
		http.Error(w, "Failed to get file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	fmt.Printf("[Upload] 开始处理文件: %s, 大小: %d\n", header.Filename, header.Size)

	filePath := header.Filename
	if relativePath != "" {
		filePath = fmt.Sprintf("%s/%s", relativePath, header.Filename)
	}
	fmt.Printf("[Upload] 完整文件路径: %s\n", filePath)

	tmpFile, err := os.CreateTemp("", "upload-*.tmp")
	if err != nil {
		fmt.Printf("[Upload] 创建临时文件失败: %v\n", err)
		http.Error(w, "Failed to create temp file", http.StatusInternalServerError)
		return
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	_, err = io.Copy(tmpFile, file)
	if err != nil {
		fmt.Printf("[Upload] 写入临时文件失败: %v\n", err)
		http.Error(w, "Failed to write temp file", http.StatusInternalServerError)
		return
	}

	tmpFile.Seek(0, 0)

	fileMD5, err := calculateFileMD5(tmpFile)
	if err != nil {
		fmt.Printf("[Upload] 计算文件MD5失败: %v\n", err)
		http.Error(w, "Failed to calculate MD5", http.StatusInternalServerError)
		return
	}
	fmt.Printf("[Upload] 文件MD5: %s\n", fileMD5)

	tmpFile.Seek(0, 0)

	err = singleUpload(accessToken, filePath, tmpFile)
	if err != nil {
		fmt.Printf("[Upload] 单步上传失败: %v\n", err)
		http.Error(w, "Upload failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"path":    getBaiduPath(filePath),
		"message": "单步上传成功",
	})
	return
}

func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func getTokenHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取授权码
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing code parameter", http.StatusBadRequest)
		return
	}

	fmt.Printf("[GetToken] 收到授权码: %s\n", code)

	// 构建获取token的请求
	tokenUrl := "https://openapi.baidu.com/oauth/2.0/token"
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("client_id", ClientID)
	form.Set("client_secret", ClientSecret)
	form.Set("redirect_uri", RedirectURI)

	fmt.Printf("[GetToken] 请求URL: %s\n", tokenUrl)
	fmt.Printf("[GetToken] 请求参数: grant_type=authorization_code, code=%s, client_id=%s, redirect_uri=%s\n", code, ClientID, RedirectURI)

	// 发送请求
	resp, err := http.Post(tokenUrl, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		fmt.Printf("[GetToken] HTTP请求错误: %v\n", err)
		http.Error(w, "Failed to request token: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[GetToken] 读取响应失败: %v\n", err)
		http.Error(w, "Failed to read response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[GetToken] 原始响应: %s\n", string(body))

	// 解析响应
	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		fmt.Printf("[GetToken] 解析JSON失败: %v\n", err)
		http.Error(w, "Failed to parse response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 检查是否有错误
	if tokenResp.Error != "" {
		fmt.Printf("[GetToken] 获取token失败: %s, %s\n", tokenResp.Error, tokenResp.ErrorDescription)
		http.Error(w, "Failed to get token: "+tokenResp.ErrorDescription, http.StatusBadRequest)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"access_token":  tokenResp.AccessToken,
		"expires_in":    tokenResp.ExpiresIn,
		"refresh_token": tokenResp.RefreshToken,
		"scope":         tokenResp.Scope,
		"message":       "获取token成功",
	})
	fmt.Printf("[GetToken] 获取token成功，过期时间: %d秒\n", tokenResp.ExpiresIn)
}

func refreshTokenHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析请求体
	var req struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Failed to parse request: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.RefreshToken == "" {
		http.Error(w, "Missing refresh_token parameter", http.StatusBadRequest)
		return
	}

	if req.ClientID == "" {
		http.Error(w, "Missing client_id parameter", http.StatusBadRequest)
		return
	}

	if req.ClientSecret == "" {
		http.Error(w, "Missing client_secret parameter", http.StatusBadRequest)
		return
	}

	fmt.Printf("[RefreshToken] 收到刷新token请求\n")

	// 构建刷新token的请求
	tokenUrl := "https://openapi.baidu.com/oauth/2.0/token"
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", req.RefreshToken)
	form.Set("client_id", req.ClientID)
	form.Set("client_secret", req.ClientSecret)

	fmt.Printf("[RefreshToken] 请求URL: %s\n", tokenUrl)

	// 发送请求
	resp, err := http.Post(tokenUrl, "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		fmt.Printf("[RefreshToken] HTTP请求错误: %v\n", err)
		http.Error(w, "Failed to request token: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[RefreshToken] 读取响应失败: %v\n", err)
		http.Error(w, "Failed to read response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[RefreshToken] 原始响应: %s\n", string(body))

	// 解析响应
	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		fmt.Printf("[RefreshToken] 解析JSON失败: %v\n", err)
		http.Error(w, "Failed to parse response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 检查是否有错误
	if tokenResp.Error != "" {
		fmt.Printf("[RefreshToken] 刷新token失败: %s, %s\n", tokenResp.Error, tokenResp.ErrorDescription)
		http.Error(w, "Failed to refresh token: "+tokenResp.ErrorDescription, http.StatusBadRequest)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"access_token":  tokenResp.AccessToken,
		"expires_in":    tokenResp.ExpiresIn,
		"refresh_token": tokenResp.RefreshToken,
		"scope":         tokenResp.Scope,
		"message":       "刷新token成功",
	})
	fmt.Printf("[RefreshToken] 刷新token成功，过期时间: %d秒\n", tokenResp.ExpiresIn)
}

func getTokenViaAlistHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取授权码
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "Missing code parameter", http.StatusBadRequest)
		return
	}

	fmt.Printf("[GetTokenViaAlist] 收到授权码: %s\n", code)

	// 调用Alist的接口获取token
	alistUrl := fmt.Sprintf("https://api.alistgo.com/alist/baidu/get_refresh_token?code=%s", code)
	fmt.Printf("[GetTokenViaAlist] 请求URL: %s\n", alistUrl)

	// 发送请求
	resp, err := http.Get(alistUrl)
	if err != nil {
		fmt.Printf("[GetTokenViaAlist] HTTP请求错误: %v\n", err)
		http.Error(w, "Failed to request token: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[GetTokenViaAlist] 读取响应失败: %v\n", err)
		http.Error(w, "Failed to read response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("[GetTokenViaAlist] 原始响应: %s\n", string(body))

	// 解析响应
	var alistResp AlistTokenResponse
	if err := json.Unmarshal(body, &alistResp); err != nil {
		fmt.Printf("[GetTokenViaAlist] 解析JSON失败: %v\n", err)
		http.Error(w, "Failed to parse response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 检查是否成功
	if !alistResp.Success {
		fmt.Printf("[GetTokenViaAlist] 获取token失败: %s\n", alistResp.Message)
		http.Error(w, "Failed to get token: "+alistResp.Message, http.StatusBadRequest)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"access_token":  alistResp.Data.AccessToken,
		"expires_in":    alistResp.Data.ExpiresIn,
		"refresh_token": alistResp.Data.RefreshToken,
		"scope":         alistResp.Data.Scope,
		"message":       "获取token成功",
	})
	fmt.Printf("[GetTokenViaAlist] 获取token成功，过期时间: %d秒\n", alistResp.Data.ExpiresIn)
}

func verifyTokenHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取token
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing token parameter", http.StatusBadRequest)
		return
	}

	fmt.Printf("[VerifyToken] 收到token验证请求\n")

	// 调用百度网盘用户信息接口
	uinfoUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/nas?method=uinfo&access_token=%s&vip_version=v2", token)
	fmt.Printf("[VerifyToken] 请求URL: %s\n", uinfoUrl)

	resp, err := http.Get(uinfoUrl)
	if err != nil {
		fmt.Printf("[VerifyToken] HTTP请求错误: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyResponse{
			Valid:   false,
			Message: "网络错误，请重试",
		})
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[VerifyToken] 读取响应失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyResponse{
			Valid:   false,
			Message: "读取响应失败",
		})
		return
	}

	fmt.Printf("[VerifyToken] 原始响应: %s\n", string(body))

	// 解析百度响应
	var baiduResp struct {
		Errno       int    `json:"errno"`
		Errmsg      string `json:"errmsg"`
		BaiduName   string `json:"baidu_name"`
		NetdiskName string `json:"netdisk_name"`
		AvatarUrl   string `json:"avatar_url"`
		VipType     int    `json:"vip_type"`
		UK          int64  `json:"uk"`
	}

	if err := json.Unmarshal(body, &baiduResp); err != nil {
		fmt.Printf("[VerifyToken] 解析JSON失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyResponse{
			Valid:   false,
			Message: "解析响应失败",
		})
		return
	}

	// 检查是否验证成功
	if baiduResp.Errno != 0 {
		fmt.Printf("[VerifyToken] 验证失败: %s\n", baiduResp.Errmsg)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyResponse{
			Valid:   false,
			Message: baiduResp.Errmsg,
		})
		return
	}

	// 返回成功响应
	fmt.Printf("[VerifyToken] 验证成功，用户: %s\n", baiduResp.BaiduName)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(VerifyResponse{
		Valid: true,
		User: struct {
			BaiduName   string `json:"baidu_name"`
			NetdiskName string `json:"netdisk_name"`
			AvatarUrl   string `json:"avatar_url"`
			VipType     int    `json:"vip_type"`
			UK          int64  `json:"uk"`
		}{
			BaiduName:   baiduResp.BaiduName,
			NetdiskName: baiduResp.NetdiskName,
			AvatarUrl:   baiduResp.AvatarUrl,
			VipType:     baiduResp.VipType,
			UK:          baiduResp.UK,
		},
	})
}

func fileListHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取token
	token := r.URL.Query().Get("access_token")
	if token == "" {
		token = r.Header.Get("Authorization")
		if token != "" && strings.HasPrefix(token, "Bearer ") {
			token = strings.TrimPrefix(token, "Bearer ")
		} else {
			http.Error(w, "Missing access_token", http.StatusBadRequest)
			return
		}
	}

	// 获取路径
	path := r.URL.Query().Get("path")
	if path == "" {
		path = fmt.Sprintf("/apps/%s", AppName)
	}

	fmt.Printf("[FileList] 收到文件列表请求，路径: %s\n", path)

	// 调用百度网盘文件列表接口
	listUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/file?method=list&access_token=%s&path=%s&web=1&order=name&desc=0", token, url.QueryEscape(path))
	fmt.Printf("[FileList] 请求URL: %s\n", listUrl)

	resp, err := http.Get(listUrl)
	if err != nil {
		fmt.Printf("[FileList] HTTP请求错误: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FileListResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "网络错误，请重试",
		})
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[FileList] 读取响应失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FileListResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "读取响应失败",
		})
		return
	}

	fmt.Printf("[FileList] 原始响应: %s\n", string(body))

	// 解析响应
	var fileListResp FileListResponse
	if err := json.Unmarshal(body, &fileListResp); err != nil {
		fmt.Printf("[FileList] 解析JSON失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FileListResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "解析响应失败",
		})
		return
	}

	// 返回响应
	fmt.Printf("[FileList] 获取文件列表成功，文件数量: %d\n", len(fileListResp.List))
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fileListResp)
}

func searchHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取搜索关键字
	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, "Missing key parameter", http.StatusBadRequest)
		return
	}

	// 获取搜索目录
	dir := r.URL.Query().Get("dir")
	if dir == "" {
		dir = fmt.Sprintf("/apps/%s", AppName)
	}

	// 获取access_token
	token := r.URL.Query().Get("access_token")
	if token == "" {
		token = r.Header.Get("Authorization")
		if token != "" && strings.HasPrefix(token, "Bearer ") {
			token = strings.TrimPrefix(token, "Bearer ")
		}
	}

	if token == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "未授权，请先绑定百度网盘账号",
			Total:    0,
		})
		return
	}

	fmt.Printf("[Search] 收到搜索请求，关键字: %s, 目录: %s\n", key, dir)

	// 调用百度网盘搜索接口，使用dir参数限制搜索目录
	searchUrl := fmt.Sprintf("https://pan.baidu.com/rest/2.0/xpan/file?method=search&access_token=%s&key=%s&dir=%s&recursion=1",
		token, url.QueryEscape(key), url.QueryEscape(dir))
	fmt.Printf("[Search] 请求URL: %s\n", searchUrl)

	resp, err := http.Get(searchUrl)
	if err != nil {
		fmt.Printf("[Search] HTTP请求错误: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "网络错误，请重试",
			Total:    0,
		})
		return
	}
	defer resp.Body.Close()

	// 读取响应
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[Search] 读取响应失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "读取响应失败",
			Total:    0,
		})
		return
	}

	fmt.Printf("[Search] 原始响应: %s\n", string(body))

	// 解析响应
	var searchResp SearchResponse
	if err := json.Unmarshal(body, &searchResp); err != nil {
		fmt.Printf("[Search] 解析JSON失败: %v\n", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{
			List:     []FileInfo{},
			Errno:    1,
			ErrorMsg: "解析响应失败",
			Total:    0,
		})
		return
	}

	// 过滤只保留电子书文件
	filteredFiles := []FileInfo{}
	for _, file := range searchResp.List {
		ext := strings.ToLower(filepath.Ext(file.ServerFilename))
		if ext == ".epub" || ext == ".pdf" || ext == ".txt" {
			filteredFiles = append(filteredFiles, file)
		}
	}

	fmt.Printf("[Search] 过滤后的电子书数量: %d\n", len(filteredFiles))

	// 返回结果
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SearchResponse{
		List:     filteredFiles,
		Errno:    searchResp.Errno,
		ErrorMsg: searchResp.ErrorMsg,
		Total:    len(filteredFiles),
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	setCORSHeaders(w)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}

func main() {
	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/api/baidu/pan/upload", uploadHandler)
	http.HandleFunc("/api/baidu/pan/verify", verifyTokenHandler)       // 验证token
	http.HandleFunc("/api/baidu/pan/file", fileListHandler)            // 获取文件列表
	http.HandleFunc("/api/baidu/pan/search", searchHandler)            // 搜索文件
	http.HandleFunc("/api/baidu/oauth/token", getTokenHandler)         // 获取token
	http.HandleFunc("/api/baidu/oauth/refresh", refreshTokenHandler)   // 刷新token
	http.HandleFunc("/api/baidu/alist/token", getTokenViaAlistHandler) // 通过Alist获取token

	addr := fmt.Sprintf(":%d", Port)
	fmt.Printf("Go服务器启动，端口 %d\n", Port)
	fmt.Printf("健康检查: http://localhost%s/health\n", addr)
	fmt.Printf("上传接口: http://localhost%s/api/baidu/pan/upload\n", addr)
	fmt.Printf("验证token: http://localhost%s/api/baidu/pan/verify\n", addr)
	fmt.Printf("文件列表: http://localhost%s/api/baidu/pan/file\n", addr)
	fmt.Printf("搜索接口: http://localhost%s/api/baidu/pan/search\n", addr)
	fmt.Printf("获取token: http://localhost%s/api/baidu/oauth/token\n", addr)
	fmt.Printf("刷新token: http://localhost%s/api/baidu/oauth/refresh\n", addr)
	fmt.Printf("通过Alist获取token: http://localhost%s/api/baidu/alist/token\n", addr)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
