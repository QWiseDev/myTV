'use client';

/**
 * 用户列表表格：选择、角色/状态展示与各类操作按钮
 */

import { AdminConfig } from '@/lib/admin.types';

import { TVBoxTokenCell } from '@/components/TVBoxTokenManager';

import { buttonStyles } from '../adminShared';

type UserRole = 'user' | 'admin' | 'owner';
type UserInfo = AdminConfig['UserConfig']['Users'][number];

interface UserListTableProps {
  users: UserInfo[];
  role: 'owner' | 'admin' | null;
  currentUsername: string | null;
  selectedUsers: Set<string>;
  selectAllUsers: boolean;
  onSelectUser: (username: string, checked: boolean) => void;
  onSelectAllUsers: (checked: boolean) => void;
  onConfigureApis: (user: {
    username: string;
    role: UserRole;
    enabledApis?: string[];
  }) => void;
  onConfigureUserGroup: (user: {
    username: string;
    role: UserRole;
    tags?: string[];
  }) => void;
  onConfigureTVBox: (user: {
    username: string;
    tvboxToken?: string;
    tvboxEnabledSources?: string[];
  }) => void;
  onChangePassword: (username: string) => void;
  onSetAdmin: (username: string) => void;
  onRemoveAdmin: (username: string) => void;
  onBanUser: (username: string) => void;
  onUnbanUser: (username: string) => void;
  onDeleteUser: (username: string) => void;
  isLoading: (key: string) => boolean;
}

export function UserListTable({
  users,
  role,
  currentUsername,
  selectedUsers,
  selectAllUsers,
  onSelectUser,
  onSelectAllUsers,
  onConfigureApis,
  onConfigureUserGroup,
  onConfigureTVBox,
  onChangePassword,
  onSetAdmin,
  onRemoveAdmin,
  onBanUser,
  onUnbanUser,
  onDeleteUser,
  isLoading,
}: UserListTableProps) {
  return (
    <div
      className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto relative'
      data-table='user-list'
    >
      <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
        <thead className='bg-gray-50 dark:bg-gray-900 sticky top-0 z-10'>
          <tr>
            <th className='w-4' />
            <th className='w-10 px-1 py-3 text-center'>
              {(() => {
                // 检查是否有权限操作任何用户
                const hasAnyPermission = users.some(
                  (user) =>
                    role === 'owner' ||
                    (role === 'admin' &&
                      (user.role === 'user' || user.username === currentUsername))
                );

                return hasAnyPermission ? (
                  <input
                    type='checkbox'
                    checked={selectAllUsers}
                    onChange={(e) => onSelectAllUsers(e.target.checked)}
                    className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                  />
                ) : (
                  <div className='w-4 h-4' />
                );
              })()}
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              用户名
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              角色
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              状态
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              用户组
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              采集源权限
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              TVBox Token
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
            >
              操作
            </th>
          </tr>
        </thead>
        {/* 按规则排序用户：自己 -> 站长(若非自己) -> 管理员 -> 其他 */}
        {(() => {
          const sortedUsers = [...users].sort((a, b) => {
            const priority = (u: UserInfo) => {
              if (u.username === currentUsername) return 0;
              if (u.role === 'owner') return 1;
              if (u.role === 'admin') return 2;
              return 3;
            };
            return priority(a) - priority(b);
          });
          return (
            <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
              {sortedUsers.map((user) => {
                // 修改密码权限：站长可修改管理员和普通用户密码，管理员可修改普通用户和自己的密码，但任何人都不能修改站长密码
                const canChangePassword =
                  user.role !== 'owner' && // 不能修改站长密码
                  (role === 'owner' || // 站长可以修改管理员和普通用户密码
                    (role === 'admin' &&
                      (user.role === 'user' ||
                        user.username === currentUsername))); // 管理员可以修改普通用户和自己的密码

                // 删除用户权限：站长可删除除自己外的所有用户，管理员仅可删除普通用户
                const canDeleteUser =
                  user.username !== currentUsername &&
                  (role === 'owner' || // 站长可以删除除自己外的所有用户
                    (role === 'admin' && user.role === 'user')); // 管理员仅可删除普通用户

                // 其他操作权限：不能操作自己，站长可操作所有用户，管理员可操作普通用户
                const canOperate =
                  user.username !== currentUsername &&
                  (role === 'owner' ||
                    (role === 'admin' && user.role === 'user'));
                return (
                  <tr
                    key={user.username}
                    className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
                  >
                    <td className='w-4' />
                    <td className='w-10 px-1 py-3 text-center'>
                      {role === 'owner' ||
                      (role === 'admin' &&
                        (user.role === 'user' ||
                          user.username === currentUsername)) ? (
                        <input
                          type='checkbox'
                          checked={selectedUsers.has(user.username)}
                          onChange={(e) =>
                            onSelectUser(user.username, e.target.checked)
                          }
                          className='w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600'
                        />
                      ) : (
                        <div className='w-4 h-4' />
                      )}
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                      {user.username}
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'owner'
                            ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                            : user.role === 'admin'
                            ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {user.role === 'owner'
                          ? '站长'
                          : user.role === 'admin'
                          ? '管理员'
                          : '普通用户'}
                      </span>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          !user.banned
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {!user.banned ? '正常' : '已封禁'}
                      </span>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='flex items-center space-x-2'>
                        <span className='text-sm text-gray-900 dark:text-gray-100'>
                          {user.tags && user.tags.length > 0
                            ? user.tags.join(', ')
                            : '无用户组'}
                        </span>
                        {/* 配置用户组按钮 */}
                        {(role === 'owner' ||
                          (role === 'admin' &&
                            (user.role === 'user' ||
                              user.username === currentUsername))) && (
                          <button
                            onClick={() => onConfigureUserGroup(user)}
                            className={buttonStyles.roundedPrimary}
                          >
                            配置
                          </button>
                        )}
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='flex items-center space-x-2'>
                        <span className='text-sm text-gray-900 dark:text-gray-100'>
                          {user.enabledApis && user.enabledApis.length > 0
                            ? `${user.enabledApis.length} 个源`
                            : '无限制'}
                        </span>
                        {/* 配置采集源权限按钮 */}
                        {(role === 'owner' ||
                          (role === 'admin' &&
                            (user.role === 'user' ||
                              user.username === currentUsername))) && (
                          <button
                            onClick={() => onConfigureApis(user)}
                            className={buttonStyles.roundedPrimary}
                          >
                            配置
                          </button>
                        )}
                      </div>
                    </td>
                    {/* TVBox Token 列 */}
                    <td className='px-6 py-4 whitespace-nowrap'>
                      <div className='flex items-center space-x-2'>
                        <TVBoxTokenCell tvboxToken={user.tvboxToken} />
                        {/* 配置 TVBox Token 按钮 */}
                        {(role === 'owner' ||
                          (role === 'admin' &&
                            (user.role === 'user' ||
                              user.username === currentUsername))) && (
                          <button
                            onClick={() => onConfigureTVBox(user)}
                            className={buttonStyles.roundedPrimary}
                          >
                            配置
                          </button>
                        )}
                      </div>
                    </td>
                    <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
                      {/* 修改密码按钮 */}
                      {canChangePassword && (
                        <button
                          onClick={() => onChangePassword(user.username)}
                          className={buttonStyles.roundedPrimary}
                        >
                          修改密码
                        </button>
                      )}
                      {canOperate && (
                        <>
                          {/* 其他操作按钮 */}
                          {user.role === 'user' && (
                            <button
                              onClick={() => onSetAdmin(user.username)}
                              disabled={isLoading(`setAdmin_${user.username}`)}
                              className={`${buttonStyles.roundedPurple} ${
                                isLoading(`setAdmin_${user.username}`)
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                            >
                              设为管理
                            </button>
                          )}
                          {user.role === 'admin' && (
                            <button
                              onClick={() => onRemoveAdmin(user.username)}
                              disabled={isLoading(
                                `removeAdmin_${user.username}`
                              )}
                              className={`${
                                buttonStyles.roundedSecondary
                              } ${
                                isLoading(`removeAdmin_${user.username}`)
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                            >
                              取消管理
                            </button>
                          )}
                          {user.role !== 'owner' &&
                            (!user.banned ? (
                              <button
                                onClick={() => onBanUser(user.username)}
                                disabled={isLoading(`banUser_${user.username}`)}
                                className={`${buttonStyles.roundedDanger} ${
                                  isLoading(`banUser_${user.username}`)
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                                }`}
                              >
                                封禁
                              </button>
                            ) : (
                              <button
                                onClick={() => onUnbanUser(user.username)}
                                disabled={isLoading(
                                  `unbanUser_${user.username}`
                                )}
                                className={`${
                                  buttonStyles.roundedSuccess
                                } ${
                                  isLoading(`unbanUser_${user.username}`)
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                                }`}
                              >
                                解封
                              </button>
                            ))}
                        </>
                      )}
                      {/* 删除用户按钮 - 放在最后，使用更明显的红色样式 */}
                      {canDeleteUser && (
                        <button
                          onClick={() => onDeleteUser(user.username)}
                          className={buttonStyles.roundedDanger}
                        >
                          删除用户
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })()}
      </table>
    </div>
  );
}
