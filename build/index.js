#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
const isValidSearchArgs = (args) => typeof args === 'object' &&
    args !== null &&
    typeof args.query === 'string' &&
    (args.count === undefined || typeof args.count === 'number');
class DuckDuckGoServer {
    constructor() {
        this.server = new Server({
            name: 'duckduckgo-server',
            version: '0.1.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.axiosInstance = axios.create({
            baseURL: 'https://api.duckduckgo.com',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });
        this.setupToolHandlers();
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    async searchDuckDuckGo(query, count = 5) {
        try {
            // 创建结果数组
            const results = [];
            // 尝试使用DuckDuckGo的API
            console.error('尝试使用DuckDuckGo API搜索:', query);
            try {
                const apiResponse = await axios.get('https://api.duckduckgo.com/', {
                    params: {
                        q: query,
                        format: 'json',
                        no_html: 1,
                        no_redirect: 1,
                        kl: 'wt-wt', // 全球区域
                        kad: 'zh_CN', // 中文
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    }
                });
                const data = apiResponse.data;
                // 从API响应中提取结果
                if (data.AbstractText && data.AbstractURL) {
                    results.push({
                        title: data.Heading || query,
                        url: data.AbstractURL,
                        description: data.AbstractText,
                    });
                }
                // 从RelatedTopics中提取结果
                if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                    for (const topic of data.RelatedTopics) {
                        if (results.length >= count)
                            break;
                        if (topic.FirstURL && topic.Text && !topic.Topics) {
                            results.push({
                                title: topic.Text.split(' - ')[0] || topic.Text,
                                url: topic.FirstURL,
                                description: topic.Text,
                            });
                        }
                    }
                }
            }
            catch (apiError) {
                console.error('API搜索失败:', apiError);
            }
            // 如果API没有返回足够的结果，尝试使用HTML搜索页面
            if (results.length < count) {
                console.error('API返回结果不足，尝试HTML搜索');
                try {
                    const htmlResponse = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        }
                    });
                    const html = htmlResponse.data;
                    // 使用正则表达式提取搜索结果
                    // 匹配结构: <a class="result__a" href="URL">TITLE</a> ... <a class="result__snippet">DESCRIPTION</a>
                    const resultRegex = /<a class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
                    let match;
                    while (results.length < count && (match = resultRegex.exec(html)) !== null) {
                        if (match[1] && match[2] && match[3]) {
                            results.push({
                                title: this.decodeHtmlEntities(match[2].trim()),
                                url: match[1],
                                description: this.decodeHtmlEntities(match[3].trim()),
                            });
                        }
                    }
                    // 如果上面的正则表达式没有匹配到足够的结果，尝试另一种模式
                    if (results.length < count) {
                        const alternativeRegex = /<div class="result__body">[\s\S]*?<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="result__snippet">([\s\S]*?)<\/div>/g;
                        while (results.length < count && (match = alternativeRegex.exec(html)) !== null) {
                            if (match[1] && match[2] && match[3]) {
                                results.push({
                                    title: this.decodeHtmlEntities(match[2].trim()),
                                    url: match[1],
                                    description: this.decodeHtmlEntities(match[3].trim()),
                                });
                            }
                        }
                    }
                }
                catch (htmlError) {
                    console.error('HTML搜索失败:', htmlError);
                }
            }
            // 如果仍然没有结果，返回一个模拟结果
            if (results.length === 0) {
                console.error('无法获取搜索结果，返回模拟结果');
                results.push({
                    title: '无法获取搜索结果',
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    description: `请直接访问DuckDuckGo搜索"${query}"`,
                });
            }
            return results.slice(0, count);
        }
        catch (error) {
            console.error('Error searching DuckDuckGo:', error);
            throw new McpError(ErrorCode.InternalError, `Failed to search DuckDuckGo: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    decodeHtmlEntities(html) {
        return html
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, ''); // Remove HTML tags
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'search',
                    description: '使用DuckDuckGo搜索网络',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '搜索查询',
                            },
                            count: {
                                type: 'number',
                                description: '要返回的结果数量（默认为5）',
                                minimum: 1,
                                maximum: 20,
                            },
                        },
                        required: ['query'],
                    },
                },
            ],
        }));
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            if (request.params.name !== 'search') {
                throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${request.params.name}`);
            }
            if (!isValidSearchArgs(request.params.arguments)) {
                throw new McpError(ErrorCode.InvalidParams, '无效的搜索参数');
            }
            const query = request.params.arguments.query;
            const count = Math.min(request.params.arguments.count || 5, 20);
            try {
                const results = await this.searchDuckDuckGo(query, count);
                // Format the results in a readable way
                const formattedResults = results.map((result, index) => `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.description}\n`).join('\n');
                const summary = `DuckDuckGo搜索结果: "${query}" (共 ${results.length} 条结果):\n\n${formattedResults}`;
                return {
                    content: [
                        {
                            type: 'text',
                            text: summary,
                        },
                    ],
                };
            }
            catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `搜索错误: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('DuckDuckGo MCP服务器正在通过stdio运行');
    }
}
const server = new DuckDuckGoServer();
server.run().catch(console.error);
//# sourceMappingURL=index.js.map