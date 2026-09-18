'use client';

/**
 * 用户组列表表格
 */

import { buttonStyles } from '../adminShared';

interface UserGroup {
  name: string;
  enabledApis: string[];
}

interface UserGroupTableProps {
  userGroups: UserGroup[];
  isLoading: (key: string) => boolean;
  onEdit: (group: UserGroup) => void;
  onDelete: (groupName: string) => void;
}

export function UserGroupTable({
  userGroups,
  isLoading,
  onEdit,
  onDelete,
}: UserGroupTableProps) {
  return (
    <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[20rem] overflow-y-auto overflow-x-auto relative'>
      <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
        <thead className='bg-gray-50 dark:bg-gray-900 sticky top-0 z-10'>
          <tr>
            <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
              用户组名称
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
              可用视频源
            </th>
            <th className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
              操作
            </th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
          {userGroups.map((group) => (
            <tr
              key={group.name}
              className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
            >
              <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                {group.name}
              </td>
              <td className='px-6 py-4 whitespace-nowrap'>
                <div className='flex items-center space-x-2'>
                  <span className='text-sm text-gray-900 dark:text-gray-100'>
                    {group.enabledApis && group.enabledApis.length > 0
                      ? `${group.enabledApis.length} 个源`
                      : '无限制'}
                  </span>
                </div>
              </td>
              <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
                <button
                  onClick={() => onEdit(group)}
                  disabled={isLoading(`userGroup_edit_${group.name}`)}
                  className={`${buttonStyles.roundedPrimary} ${
                    isLoading(`userGroup_edit_${group.name}`)
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
                >
                  编辑
                </button>
                <button
                  onClick={() => onDelete(group.name)}
                  className={buttonStyles.roundedDanger}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {userGroups.length === 0 && (
            <tr>
              <td colSpan={3} className='px-6 py-12'>
                <div className='flex flex-col items-center justify-center'>
                  <div className='relative mb-4'>
                    <div className='w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-200 dark:from-blue-900/40 dark:to-indigo-900/40 rounded-2xl flex items-center justify-center shadow-lg'>
                      <svg
                        className='w-8 h-8 text-blue-500 dark:text-blue-400'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth='2'
                          d='M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z'
                        ></path>
                      </svg>
                    </div>
                    <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                  </div>
                  <p className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
                    暂无用户组
                  </p>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    请添加用户组来管理用户权限
                  </p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
