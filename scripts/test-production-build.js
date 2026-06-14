#!/usr/bin/env node

/**
 * 测试生产环境构建
 * 验证 Clarity 和 ArtPlayer 在生产环境中的兼容性
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function testProductionBuild() {
  console.log('🔨 开始生产环境构建测试...\n');

  try {
    // 1. 清理之前的构建
    console.log('🧹 清理之前的构建...');
    try {
      execSync('rm -rf .next', { stdio: 'inherit' });
    } catch (error) {
      // 忽略清理错误
    }

    // 2. 设置为生产环境并构建
    console.log('\n🏗️  执行生产环境构建...');
    process.env.NODE_ENV = 'production';

    execSync('npm run build', {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });

    console.log('\n✅ 构建成功！');

    // 3. 检查构建文件中是否包含相关模块
    console.log('\n🔍 检查构建文件...');

    const nextDir = path.join(process.cwd(), '.next');

    // 检查是否包含 ArtPlayer 相关代码
    console.log('📺 检查 ArtPlayer 模块...');
    const hasArtplayer = checkModuleInBuild(nextDir, 'artplayer');
    console.log(hasArtplayer ? '  ✅ ArtPlayer 已包含在构建中' : '  ❌ ArtPlayer 未找到');

    // 检查是否包含 Clarity 相关代码
    console.log('📊 检查 Clarity 模块...');
    const hasClarity = checkModuleInBuild(nextDir, 'clarity');
    console.log(hasClarity ? '  ✅ Clarity 已包含在构建中' : '  ⚠️  Clarity 可能被优化掉（这是正常的）');

    // 4. 启动生产服务器进行简单测试
    console.log('\n🚀 启动生产服务器测试...');
    console.log('注意：服务器将启动几秒钟后自动关闭\n');

    // 启动生产服务器
    const serverProcess = execSync('npm start & echo $!', {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
      env: { ...process.env, NODE_ENV: 'production' }
    });

    const pid = parseInt(serverProcess.trim());
    console.log(`生产服务器已启动，PID: ${pid}`);

    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      // 简单的健康检查
      const response = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3000', {
        encoding: 'utf8',
        timeout: 10000
      });

      if (response === '200') {
        console.log('✅ 生产服务器响应正常 (HTTP 200)');
      } else {
        console.log(`⚠️  生产服务器响应状态码: ${response}`);
      }
    } catch (error) {
      console.log('❌ 生产服务器健康检查失败:', error.message);
    }

    // 关闭服务器
    try {
      process.kill(pid, 'SIGTERM');
      console.log('\n🛑 生产服务器已关闭');
    } catch (error) {
      console.log('⚠️  关闭服务器时出错:', error.message);
    }

    console.log('\n🎉 生产环境构建测试完成！');

  } catch (error) {
    console.error('\n❌ 构建测试失败:', error.message);
    process.exit(1);
  }
}

function checkModuleInBuild(buildDir, moduleName) {
  try {
    // 递归搜索构建目录中的文件
    const searchDir = (dir, term) => {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (searchDir(fullPath, term)) {
            return true;
          }
        } else if (file.endsWith('.js') || file.endsWith('.html')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes(term.toLowerCase())) {
              return true;
            }
          } catch (error) {
            // 忽略读取错误
          }
        }
      }
      return false;
    };

    return searchDir(buildDir, moduleName);
  } catch (error) {
    return false;
  }
}

// 运行测试
testProductionBuild();