// 简单的Node.js后端服务，用于代理百度网盘API请求
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';

const app = express();
const PORT = process.env.PORT || 3001;

// 配置CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 配置JSON解析
app.use(express.json());

// 配置urlencoded解析，处理application/x-www-form-urlencoded格式的请求
app.use(express.urlencoded({ extended: true }));

// 配置multer处理multipart/form-data
const upload = multer();

// 代理百度网盘授权相关API
app.get('/api/baidu/oauth/token', async (req, res) => {
  try {
    const response = await axios.get('https://openapi.baidu.com/oauth/2.0/token', {
      params: req.query,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘授权API失败:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || '代理请求失败'
    });
  }
});

// 代理百度网盘文件相关API
app.get('/api/baidu/pan/file', async (req, res) => {
  try {
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 构建请求URL，将access_token放在URL参数中
    const params = {
      ...req.query,
      access_token: accessToken
    };
    
    const response = await axios.get('https://pan.baidu.com/rest/2.0/xpan/file', {
      params: params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘文件API失败:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || '代理请求失败'
    });
  }
});

// 代理百度网盘文件上传相关API - 预上传
app.post('/api/baidu/pan/precreate', async (req, res) => {
  try {
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 构建请求URL，将access_token放在URL参数中
    const url = `https://pan.baidu.com/rest/2.0/xpan/file?method=precreate&access_token=${accessToken}`;
    
    // 获取前端传递的路径
    let { path, ...otherBody } = req.body;
    
    // 确保路径是有效的
    if (!path) {
      return res.status(400).json({ error: '缺少路径参数' });
    }
    
    // 确保路径是绝对路径
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    
    // 构建百度网盘API要求的路径格式：/apps/应用名称/路径
    // 用户应用名称是"网盘"
    // 移除前端传递的路径开头的斜杠，避免双斜杠
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const baiduPath = `/apps/网盘/${normalizedPath}`;
    console.log('原始路径:', path, '规范化路径:', normalizedPath, '百度网盘路径:', baiduPath);
    
    // 百度网盘API要求path参数需要urlencode
    const requestBody = { 
      path: encodeURIComponent(baiduPath), 
      ...otherBody 
    };
    
    const response = await axios.post(url, requestBody, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘文件预上传API失败:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || '代理请求失败'
    });
  }
});

// 代理百度网盘上传分片API
app.post('/api/baidu/pan/upload', upload.single('file'), async (req, res) => {
  try {
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 获取上传参数
    let { path, uploadid, partseq, type, uploadDomain } = req.body;
    if (!path || !uploadid || !partseq || !type) {
      return res.status(400).json({ error: '缺少必要的上传参数' });
    }
    
    // 确保路径是绝对路径
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    
    // 构建百度网盘API要求的路径格式：/apps/应用名称/路径
    // 用户应用名称是"网盘"
    // 移除前端传递的路径开头的斜杠，避免双斜杠
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const baiduPath = `/apps/网盘/${normalizedPath}`;
    console.log('分片上传原始路径:', path, '规范化路径:', normalizedPath, '百度网盘路径:', baiduPath);
    
    // 构建请求URL，将所有必要参数放在URL参数中
    // 使用前端传递的上传域名，如果没有则使用默认域名
    const uploadHost = uploadDomain ? uploadDomain.replace('https://', '') : 'd.pcs.baidu.com';
    const url = `https://${uploadHost}/rest/2.0/pcs/superfile2?method=upload&access_token=${accessToken}&path=${encodeURIComponent(baiduPath)}&uploadid=${encodeURIComponent(uploadid)}&partseq=${partseq}&type=${type}`;
    
    // 构建form-data表单
    const formData = new FormData();
    if (req.file) {
      formData.append('file', req.file.buffer, req.file.originalname);
    }
    
    // 使用 multipart/form-data 格式上传文件
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘上传分片API失败:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || '代理请求失败'
    });
  }
});

// 代理百度网盘创建目录API
app.post('/api/baidu/pan/mkdir', async (req, res) => {
  try {
    console.log('========================================');
    console.log('收到mkdir请求:', req.method, req.url);
    console.log('请求头:', req.headers);
    
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      console.error('缺少access_token');
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 打印请求体，以便调试
    console.log('mkdir请求体:', req.body);
    
    // 构建请求URL，将access_token放在URL参数中
    const url = `https://pan.baidu.com/rest/2.0/xpan/file?method=mkdir&access_token=${accessToken}`;
    console.log('百度网盘API URL:', url);
    
    // 获取前端传递的路径
    let { path } = req.body;
    
    // 确保路径是绝对路径
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    
    // 构建百度网盘API要求的路径格式：/apps/应用名称/路径
    // 用户应用名称是"网盘"
    // 移除前端传递的路径开头的斜杠，避免双斜杠
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const baiduPath = `/apps/网盘/${normalizedPath}`;
    console.log('原始路径:', path, '规范化路径:', normalizedPath, '百度网盘路径:', baiduPath);
    
    // 构建请求参数，百度网盘API要求path参数需要urlencode
    const requestBody = { path: encodeURIComponent(baiduPath), isdir: 1 };
    console.log('向百度网盘发送的mkdir请求参数:', requestBody);
    
    // 记录完整请求
    console.log('发送请求到百度网盘:', {
      url: url,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: requestBody
    });
    
    const response = await axios.post(url, requestBody, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('百度网盘mkdir响应:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘创建目录API失败:', error);
    if (error.response) {
      console.error('百度网盘返回的错误:', error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: '代理请求失败' });
    }
  }
});

// 代理百度网盘获取上传域名API
app.get('/api/baidu/pan/locateupload', async (req, res) => {
  try {
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 构建请求URL，将所有必要参数放在URL参数中
    const { path, uploadid, ...otherParams } = req.query;
    
    // 确保路径是绝对路径
    let baiduPath = path;
    if (baiduPath && !baiduPath.startsWith('/')) {
      baiduPath = `/${baiduPath}`;
    }
    
    // 构建百度网盘API要求的路径格式：/apps/应用名称/路径
    // 用户应用名称是"网盘"
    // 移除前端传递的路径开头的斜杠，避免双斜杠
    if (baiduPath) {
      const normalizedPath = baiduPath.startsWith('/') ? baiduPath.substring(1) : baiduPath;
      baiduPath = `/apps/网盘/${normalizedPath}`;
      console.log('locateupload原始路径:', path, '规范化路径:', normalizedPath, '百度网盘路径:', baiduPath);
    }
    
    // 构建完整的请求URL
    const url = `https://d.pcs.baidu.com/rest/2.0/pcs/file?method=locateupload&appid=250528&access_token=${accessToken}&path=${encodeURIComponent(baiduPath)}&uploadid=${uploadid}&upload_version=2.0`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘获取上传域名API失败:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || '代理请求失败'
    });
  }
});

// 代理百度网盘创建文件API
app.post('/api/baidu/pan/create', async (req, res) => {
  try {
    console.log('========================================');
    console.log('收到create请求:', req.method, req.url);
    console.log('请求头:', req.headers);
    
    // 从请求头获取access_token
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (!accessToken) {
      console.error('缺少access_token');
      return res.status(400).json({ error: '缺少access_token' });
    }
    
    // 打印请求体，以便调试
    console.log('create请求体:', req.body);
    
    // 构建请求URL，将access_token放在URL参数中
    const url = `https://pan.baidu.com/rest/2.0/xpan/file?method=create&access_token=${accessToken}`;
    console.log('百度网盘API URL:', url);
    
    // 获取前端传递的路径
    let { path, ...otherBody } = req.body;
    
    // 确保路径是有效的
    if (!path) {
      console.error('缺少路径参数');
      return res.status(400).json({ error: '缺少路径参数' });
    }
    
    // 确保路径是绝对路径
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    
    // 构建百度网盘API要求的路径格式：/apps/应用名称/路径
    // 用户应用名称是"网盘"
    
    // 注意：前端传递的路径已经包含了文件名，如"/禅非一枝花.epub"
    // 我们需要提取文件名，然后构建正确的百度网盘路径
    
    // 提取文件名
    const pathParts = path.split('/');
    const fileName = pathParts.pop() || '';
    const directoryPath = pathParts.join('/');
    
    // 构建百度网盘路径
    let baiduPath;
    if (directoryPath) {
      // 如果有目录路径，确保路径格式正确
      baiduPath = `/apps/网盘${directoryPath.startsWith('/') ? '' : '/'}${directoryPath}/${fileName}`;
    } else {
      // 如果没有目录路径，直接构建路径
      baiduPath = `/apps/网盘/${fileName}`;
    }
    
    // 移除路径中的双斜杠
    baiduPath = baiduPath.replace(/\/+/g, '/');
    console.log('修复后的百度网盘路径:', baiduPath);
    console.log('原始路径:', path, '目录路径:', directoryPath, '文件名:', fileName, '百度网盘路径:', baiduPath);
    
    // 构建请求参数，百度网盘API要求path参数需要urlencode
    const encodedPath = encodeURIComponent(baiduPath);
    console.log('编码前的百度网盘路径:', baiduPath);
    console.log('编码后的百度网盘路径:', encodedPath);
    console.log('解码后的百度网盘路径:', decodeURIComponent(encodedPath));
    
    // 确保所有参数都是正确的类型
    const requestBody = { 
      path: encodedPath, // 使用编码后的路径
      size: String(otherBody.size), // 确保size是字符串
      isdir: String(otherBody.isdir), // 确保isdir是字符串
      block_list: otherBody.block_list, // 确保block_list是数组
      uploadid: String(otherBody.uploadid), // 确保uploadid是字符串
      rtype: Number(otherBody.rtype) // 确保rtype是数字
    };
    console.log('向百度网盘发送的create请求参数:', requestBody);
    console.log('请求参数类型检查:');
    console.log('path类型:', typeof requestBody.path);
    console.log('size类型:', typeof requestBody.size);
    console.log('isdir类型:', typeof requestBody.isdir);
    console.log('block_list类型:', typeof requestBody.block_list, '是数组:', Array.isArray(requestBody.block_list));
    console.log('uploadid类型:', typeof requestBody.uploadid);
    console.log('rtype类型:', typeof requestBody.rtype);
    
    // 记录完整请求
    console.log('发送请求到百度网盘:', {
      url: url,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/json'
      },
      data: requestBody
    });
    
    const response = await axios.post(url, requestBody, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('百度网盘create响应:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('代理百度网盘创建文件API失败:', error);
    if (error.response) {
      console.error('百度网盘返回的错误:', error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: '代理请求失败' });
    }
  }
});

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '代理服务运行正常' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`代理服务已启动，监听端口 ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`百度网盘授权代理: http://localhost:${PORT}/api/baidu/oauth/token`);
  console.log(`百度网盘文件API代理: http://localhost:${PORT}/api/baidu/pan/file`);
  console.log(`百度网盘预上传代理: http://localhost:${PORT}/api/baidu/pan/precreate`);
  console.log(`百度网盘分片上传代理: http://localhost:${PORT}/api/baidu/pan/upload`);
  console.log(`百度网盘创建文件代理: http://localhost:${PORT}/api/baidu/pan/create`);
});
