import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
  } catch (e) {
    console.error('加载 .env 文件失败:', e);
  }
}

loadEnv(path.join(__dirname, '../.env'));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false } }
);

async function cleanupAdminConfig() {
  console.log('=== 检查所有 admin_config 记录 ===');

  const { data: allConfigs, error } = await supabase
    .from('admin_config')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`找到 ${allConfigs.length} 条配置记录:`);
  allConfigs.forEach((config: any, i: number) => {
    const sourceCount = config.config?.SourceConfig?.length || 0;
    console.log(`  [${i}] id: ${config.id}`);
    console.log(`      SourceConfig: ${sourceCount} 条`);
    console.log(`      updated_at: ${config.updated_at}`);
    console.log(`      created_at: ${config.created_at}`);
  });

  if (allConfigs.length <= 1) {
    console.log('\n只有一条记录，无需清理');
    return;
  }

  console.log('\n=== 删除除最新记录外的所有记录 ===');

  const latestId = allConfigs[0].id;
  const idsToDelete = allConfigs.slice(1).map((c: any) => c.id);

  console.log(`保留最新记录: ${latestId}`);
  console.log(`删除记录: ${idsToDelete.join(', ')}`);

  const { error: deleteError } = await supabase
    .from('admin_config')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('删除失败:', deleteError);
    return;
  }

  console.log('\n✓ 删除成功');

  const { data: remainingConfigs } = await supabase
    .from('admin_config')
    .select('config');

  console.log(`\n剩余配置记录数: ${remainingConfigs?.length || 0}`);
  if (remainingConfigs && remainingConfigs.length > 0) {
    const sourceCount = remainingConfigs[0].config?.SourceConfig?.length || 0;
    console.log(`SourceConfig 数量: ${sourceCount}`);
  }
}

cleanupAdminConfig();
