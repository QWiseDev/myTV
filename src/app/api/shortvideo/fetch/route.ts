import { NextRequest, NextResponse } from 'next/server';

/**
 * 检查视频URL是否有效
 */
async function validateVideoUrl(videoUrl: string): Promise<boolean> {
  try {
    // 检查URL格式
    if (!videoUrl || !videoUrl.startsWith('http')) {
      console.log('无效的URL格式:', videoUrl);
      return false;
    }

    // 检查URL中是否包含明显的错误关键词
    const errorKeywords = [
      '404',
      'error',
      'notfound',
      'not-found',
      'undefined',
    ];
    const urlLower = videoUrl.toLowerCase();
    if (errorKeywords.some((keyword) => urlLower.includes(keyword))) {
      console.log('URL包含错误关键词:', videoUrl);
      return false;
    }

    // 对视频URL进行HEAD请求检查是否可访问
    let response;
    try {
      response = await safeFetch(videoUrl, {
        method: 'HEAD',
        redirect: 'follow',
        cache: 'no-cache',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          Referer: 'https://www.kuaishou.com/',
          Accept: 'video/*, */*;q=0.1',
        },
      });
    } catch (fetchError) {
      console.log(
        'HEAD请求失败，尝试GET请求:',
        fetchError instanceof Error ? fetchError.message : 'Unknown error'
      );
      // 如果HEAD请求失败，尝试GET请求（只获取前几个字节）
      response = await safeFetch(videoUrl, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-cache',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          Referer: 'https://www.kuaishou.com/',
          Accept: 'video/*, */*;q=0.1',
          Range: 'bytes=0-511', // 只获取前512字节进行验证
        },
      });
    }

    // 检查响应状态
    if (!response.ok && response.status !== 206) {
      console.log(`HTTP错误状态: ${response.status} ${response.statusText}`);
      return false;
    }

    // 检查响应内容类型
    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const isValidStatus = response.ok || response.status === 206;

    // 更严格的内容类型检查
    const isVideoContent =
      contentType.includes('video/') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('binary/octet-stream') ||
      videoUrl.includes('.mp4') ||
      videoUrl.includes('.m3u8') ||
      videoUrl.includes('.ts') ||
      videoUrl.includes('.flv') ||
      videoUrl.includes('.webm');

    // 检查内容长度，避免0字节文件
    if (contentLength && parseInt(contentLength) === 0) {
      console.log('视频文件为空');
      return false;
    }

    const isValid = isValidStatus && isVideoContent;
    console.log(
      `视频URL验证结果: ${isValid}, Content-Type: ${contentType}, Status: ${response.status}`
    );

    return isValid;
  } catch (error) {
    console.log('视频URL验证失败:', error);
    return false;
  }
}

/**
 * 安全地获取API响应
 */
async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // 检查响应是否成功
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查网络设置');
    }
    throw error;
  }
}

/**
 * 从指定API获取视频地址的公共函数
 */
async function fetchVideoFromApi(apiUrl: string) {
  let attempts = 0;
  const maxAttempts = 3; // 最多尝试3次获取有效视频

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // 尝试使用 HEAD 请求只获取响应头，不下载视频内容
      let response = await safeFetch(apiUrl, {
        method: 'HEAD', // 只请求头部，不下载内容
        redirect: 'follow', // 跟随重定向
        cache: 'no-cache', // 禁用缓存
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      // 获取最终的URL（重定向后的地址）
      let videoUrl = response.url;

      // 如果 HEAD 请求失败或没有获取到有效URL，回退到 GET 请求但使用 Range 头
      if (
        !videoUrl ||
        videoUrl === apiUrl ||
        response.status === 405 ||
        response.status === 501
      ) {
        // HEAD 方法不被支持，回退到 GET
        response = await safeFetch(apiUrl, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-cache',
          // 只请求前1KB数据，避免下载整个视频
          headers: {
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Range: 'bytes=0-1023', // 只获取前1KB
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        videoUrl = response.url;
      }

      // 如果仍然无法获取有效URL，尝试从 Location 头获取
      if (!videoUrl || videoUrl === apiUrl) {
        const location = response.headers.get('Location');
        if (location) {
          videoUrl = location.startsWith('http')
            ? location
            : new URL(location, apiUrl).href;
        }
      }

      // 验证是否获取到了有效的视频URL
      if (!videoUrl || videoUrl === apiUrl) {
        throw new Error('无法获取有效的视频地址');
      }

      // 验证视频URL的有效性
      const isValidVideo = await validateVideoUrl(videoUrl);
      if (isValidVideo) {
        return NextResponse.json(
          {
            success: true,
            url: videoUrl,
            timestamp: Date.now(),
          },
          {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
              Expires: '0',
            },
          }
        );
      } else {
        console.log(`第${attempts}次尝试获取的视频URL无效: ${videoUrl}`);
        if (attempts >= maxAttempts) {
          throw new Error(`已尝试${maxAttempts}次，无法获取有效的视频地址`);
        }
        // 继续下一次尝试
        continue;
      }
    } catch (error) {
      console.log(`第${attempts}次尝试获取视频失败:`, error);
      if (attempts >= maxAttempts) {
        throw error;
      }
      // 继续下一次尝试
      continue;
    }
  }

  throw new Error('无法获取有效的视频地址');
}

/**
 * GET /api/shortvideo/fetch - 获取短视频地址（向后兼容）
 * 该接口会请求外部API，该API会重定向到真实的视频地址
 */
export async function GET() {
  try {
    // 添加随机参数避免缓存，每次都请求新的内容
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const apiUrl = `http://api.yujn.cn/api/zzxjj.php?type=video&t=${timestamp}&r=${random}`;

    return await fetchVideoFromApi(apiUrl);
  } catch (error) {
    console.error('获取短视频地址失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取视频地址失败',
        message: error instanceof Error ? error.message : '未知错误',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}

/**
 * POST /api/shortvideo/fetch - 获取短视频地址
 * 该接口会请求外部API，该API会重定向到真实的视频地址
 * 支持动态API URL以支持多个栏目
 */
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('JSON解析失败:', jsonError);
      return NextResponse.json(
        {
          success: false,
          error: '请求格式错误',
          message: '请求体不是有效的JSON格式',
        },
        { status: 400 }
      );
    }

    const { apiUrl } = body;

    if (!apiUrl) {
      return NextResponse.json(
        { success: false, error: '缺少API URL参数' },
        { status: 400 }
      );
    }

    // 添加随机参数避免缓存，每次都请求新的内容
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const finalApiUrl = `${apiUrl}&t=${timestamp}&r=${random}`;

    return await fetchVideoFromApi(finalApiUrl);
  } catch (error) {
    console.error('获取短视频地址失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取视频地址失败',
        message: error instanceof Error ? error.message : '未知错误',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}
