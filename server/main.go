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
	"strings"
)

const (
	Port      = 3001
	AppName   = "网盘"
	ChunkSize = 4 * 1024 * 1024 // 4MB
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

	uploadUrl := fmt.Sprintf("%s/rest/2.0/pcs/file?method=upload&access_token=%s&path=%s&ondup=newcopy", uploadDomain, accessToken, url.QueryEscape(baiduPath))

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

	fmt.Printf("[Precreate] 请求URL: %s\n", precreateUrl)
	fmt.Printf("[Precreate] 请求参数: path=%s, isdir=0, size=%d, autoinit=1, block_list=%s, rtype=1\n", baiduPath, fileSize, blockList)

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

	fmt.Printf("[Create] 请求URL: %s\n", reqUrl)
	fmt.Printf("[Create] 请求参数: path=%s, isdir=0, size=%d, uploadid=%s, block_list=%s, rtype=1\n", baiduPath, fileSize, uploadid, blockList)

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

	addr := fmt.Sprintf(":%d", Port)
	fmt.Printf("Go服务器启动，端口 %d\n", Port)
	fmt.Printf("健康检查: http://localhost%s/health\n", addr)
	fmt.Printf("上传接口: http://localhost%s/api/baidu/pan/upload\n", addr)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("服务器启动失败: %v", err)
	}
}
