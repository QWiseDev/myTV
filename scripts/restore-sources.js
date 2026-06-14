#!/usr/bin/env node

/**
 * 恢复视频源脚本
 * 使用方法: node scripts/restore-sources.js <backup-file>
 */

const { db } = require('../src/lib/db');
const { configSelfCheck, setCachedConfig } = require('../src/lib/config');

async function restoreSources(backupFile) {
  console.log(`🔍 正在读取备份文件: ${backupFile}`);

  try {
    // 读取备份文件
    const fs = require('fs');
    if (!fs.existsSync(backupFile)) {
      console.error(`❌ 备份文件不存在: ${backupFile}`);
      console.log('💡 提示: 请检查备份文件路径是否正确');
      process.exit(1);
    }

    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));

    if (!Array.isArray(backupData)) {
      console.error('❌ 备份文件格式错误，应该是一个数组');
      process.exit(1);
    }

    console.log(`📦 找到 ${backupData.length} 个视频源要恢复`);

    // 读取当前配置
    let adminConfig = await db.getAdminConfig();

    if (!adminConfig) {
      console.error('❌ 无法获取管理员配置');
      process.exit(1);
    }

    // 将备份的视频源添加到当前配置中
    adminConfig.SourceConfig = [...(adminConfig.SourceConfig || []), ...backupData];

    // 执行自我检查以确保配置一致性
    adminConfig = await configSelfCheck(adminConfig);

    // 清除缓存
    setCachedConfig(adminConfig);

    // 保存到数据库
    await db.saveAdminConfig(adminConfig);

    console.log('✅ 视频源恢复成功！');
    console.log(`   共恢复: ${backupData.length} 个视频源`);

    // 验证恢复
    const verifyConfig = await db.getAdminConfig();
    const restoredSources = verifyConfig.SourceConfig || [];

    console.log('\n📋 恢复的视频源:');
    restoredSources.slice(-backupData.length).forEach((source, index) => {
      console.log(`   ${restoreSources.length - backupData.length + index + 1}. ${source.name} (${source.key})`);
    });

    console.log('\n💡 提示:');
    console.log('   - 所有视频源已从备份文件中恢复');
    console.log('   - 您可以在管理后台查看和管理视频源');
    console.log(`   - 如需重新删除，请运行: node scripts/delete-all-sources.js`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 恢复视频源时出错:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error('❌ 请提供备份文件路径');
    console.log('');
    console.log('使用方法:');
    console.log('   node scripts/restore-sources.js <backup-file>');
    console.log('');
    console.log('示例:');
    console.log('   node scripts/restore-sources.js sources-backup-1234567890.json');
    console.log('');
    process.exit(1);
  }

  console.log('🚀 开始恢复视频源...\n');
  restoreSources(backupFile);
}

module.exports = { restoreSources };
