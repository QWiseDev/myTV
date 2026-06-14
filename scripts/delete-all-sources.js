#!/usr/bin/env node

/**
 * 删除所有视频源脚本
 * 使用方法: node scripts/delete-all-sources.js
 */

const { db } = require('../src/lib/db');
const { configSelfCheck, setCachedConfig } = require('../src/lib/config');

async function deleteAllSources() {
  console.log('🔍 正在读取当前配置...');

  try {
    // 读取当前配置
    let adminConfig = await db.getAdminConfig();

    if (!adminConfig) {
      console.error('❌ 无法获取管理员配置');
      process.exit(1);
    }

    // 备份视频源
    const sourcesBackup = adminConfig.SourceConfig || [];
    const backupFile = `sources-backup-${Date.now()}.json`;

    // 保存备份到文件系统
    const fs = require('fs');
    fs.writeFileSync(
      backupFile,
      JSON.stringify(sourcesBackup, null, 2),
      'utf-8'
    );

    console.log(`💾 已备份 ${sourcesBackup.length} 个视频源到: ${backupFile}`);
    console.log('📋 备份的视频源:');
    sourcesBackup.forEach((source, index) => {
      console.log(`   ${index + 1}. ${source.name} (${source.key})`);
    });

    // 清空 SourceConfig
    adminConfig.SourceConfig = [];

    // 执行自我检查以确保配置一致性
    adminConfig = await configSelfCheck(adminConfig);

    // 清除缓存
    setCachedConfig(adminConfig);

    // 保存到数据库
    await db.saveAdminConfig(adminConfig);

    console.log('✅ 所有视频源已清空！');
    console.log(`   共删除: ${sourcesBackup.length} 个视频源`);

    // 验证删除
    const verifyConfig = await db.getAdminConfig();
    const remainingSources = verifyConfig.SourceConfig || [];

    if (remainingSources.length === 0) {
      console.log('🎉 验证成功：视频源列表为空');
    } else {
      console.error(`⚠️  警告：仍有 ${remainingSources.length} 个视频源存在:`);
      remainingSources.forEach((source) => {
        console.error(`   - ${source.name} (${source.key})`);
      });
    }

    console.log('\n💡 提示:');
    console.log('   - 如果需要恢复视频源，请使用备份文件:', backupFile);
    console.log('   - 您可以在管理后台重新添加视频源');
    console.log('   - 或者运行: node scripts/restore-sources.js', backupFile);

    process.exit(0);
  } catch (error) {
    console.error('❌ 删除视频源时出错:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  console.log('🚀 开始删除所有视频源...\n');

  // 提示确认
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    '⚠️  警告: 此操作将删除所有视频源！\n' +
      '请确认是否继续? (输入 "yes" 确认): ',
    async (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'yes') {
        await deleteAllSources();
      } else {
        console.log('❌ 操作已取消');
        process.exit(0);
      }
    }
  );
}

module.exports = { deleteAllSources };
