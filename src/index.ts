#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// SerpAPI接口定义
interface SerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    q: string;
    google_domain: string;
    gl: string;
    hl: string;
  };
  organic_results: Array<{
    position: number;
    title: string;
    link: string;
    displayed_link: string;
    snippet: string;
    snippet_highlighted_words: string[];
    sitelinks?: {
      inline?: Array<{
        title: string;
        link: string;
      }>;
      expanded?: Array<{
        title: string;
        link: string;
        snippet: string;
      }>;
    };
    about_this_result?: {
      source: {
        description: string;
        icon: string;
      };
      keywords: string[];
      languages: string[];
      regions: string[];
    };
    rich_snippet?: {
      top?: {
        detected_extensions?: {
          price?: string;
          rating?: string;
          votes?: string;
        };
        extensions?: string[];
      };
      bottom?: {
        extensions?: string[];
      };
    };
    about_page_link?: string;
    cached_page_link?: string;
    related_pages_link?: string;
  }>;
  error?: string;
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

const isValidSearchArgs = (
  args: any
): args is { query: string; count?: number } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.query === 'string' &&
  (args.count === undefined || typeof args.count === 'number');

class GoogleSearchServer {
  private server: Server;
  private axiosInstance;
  private apiKey: string;

  constructor() {
    // 从环境变量获取API密钥
    this.apiKey = process.env.SERPAPI_API_KEY || '';
    if (!this.apiKey) {
      console.error('警告: 未设置SERPAPI_API_KEY环境变量');
    }

    this.server = new Server(
      {
        name: 'google-search-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://serpapi.com',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupToolHandlers();
    
    // 错误处理
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async searchGoogle(query: string, count: number = 5): Promise<SearchResult[]> {
    try {
      if (!this.apiKey) {
        throw new Error('未设置SERPAPI_API_KEY环境变量');
      }

      console.error(`正在搜索: "${query}"`);
      
      const response = await this.axiosInstance.get<SerpApiResponse>('/search', {
        params: {
          engine: 'google',
          q: query,
          api_key: this.apiKey,
          gl: 'cn', // 地区设置为中国
          hl: 'zh-cn', // 语言设置为中文
        },
      });

      if (response.data.error) {
        throw new Error(`SerpAPI错误: ${response.data.error}`);
      }

      const results: SearchResult[] = [];
      
      if (response.data.organic_results && Array.isArray(response.data.organic_results)) {
        for (const result of response.data.organic_results) {
          if (results.length >= count) break;
          
          results.push({
            title: result.title,
            url: result.link,
            description: result.snippet || '无描述',
          });
        }
      }

      // 如果没有结果，返回一个提示
      if (results.length === 0) {
        results.push({
          title: '未找到结果',
          url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
          description: `未找到与"${query}"相关的结果`,
        });
      }

      return results.slice(0, count);
    } catch (error: any) {
      console.error('搜索Google时出错:', error);
      throw new McpError(
        ErrorCode.InternalError,
        `搜索Google失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search',
          description: '使用Google搜索网络',
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      if (request.params.name !== 'search') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `未知工具: ${request.params.name}`
        );
      }

      if (!isValidSearchArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          '无效的搜索参数'
        );
      }

      const query = request.params.arguments.query;
      const count = Math.min(request.params.arguments.count || 5, 20);

      try {
        const results = await this.searchGoogle(query, count);
        
        // 格式化结果
        const formattedResults = results.map((result, index) => 
          `${index + 1}. ${result.title}\n   URL: ${result.url}\n   ${result.description}\n`
        ).join('\n');

        const summary = `Google搜索结果: "${query}" (共 ${results.length} 条结果):\n\n${formattedResults}`;

        return {
          content: [
            {
              type: 'text',
              text: summary,
            },
          ],
        };
      } catch (error) {
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
    console.error('Google搜索MCP服务器正在通过stdio运行');
  }
}

const server = new GoogleSearchServer();
server.run().catch(console.error);