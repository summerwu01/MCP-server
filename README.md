# Google Search MCP Server

这是一个使用SerpAPI提供Google搜索功能的MCP服务器。

## 功能

- 通过SerpAPI获取Google搜索结果
- 支持自定义搜索结果数量
- 格式化搜索结果输出

## 安装

```bash
# 克隆仓库
git clone [repository-url]
cd google-search-server

# 安装依赖
npm install

# 构建项目
npm run build
```

## 配置

在使用前，需要设置SerpAPI的API密钥。可以通过环境变量`SERPAPI_API_KEY`设置，或者在MCP设置文件中配置。

## 使用方法

在MCP设置文件中添加以下配置：

```json
"google-search": {
  "command": "node",
  "args": [
    "/path/to/google-search-server/build/index.js"
  ],
  "env": {
    "SERPAPI_API_KEY": "your-api-key-here"
  },
  "disabled": false,
  "alwaysAllow": []
}
```

然后可以通过MCP工具使用：

```
use_mcp_tool
server_name: google-search
tool_name: search
arguments: 
{
  "query": "搜索关键词",
  "count": 5  // 可选，默认为5，最大为20
}
```

## 开发

```bash
# 运行开发模式
npm run dev
```

## 许可证

ISC