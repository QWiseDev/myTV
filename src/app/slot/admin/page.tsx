'use client';

import { motion } from 'framer-motion';
import { Coins, RefreshCw, Save, Shield } from 'lucide-react';
import React, { useEffect,useState } from 'react';

interface User {
  username: string;
  coins: number;
  totalSpins: number;
  totalWins: number;
  biggestWin: number;
}

export default function SlotAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editCoins, setEditCoins] = useState<number>(0);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/slot/admin');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '获取用户列表失败');
      }
      const data = await response.json();
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUserCoins = async (username: string, coins: number) => {
    try {
      const response = await fetch('/api/slot/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, coins })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '更新失败');
      }

      await fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-6 text-white">
          <h2 className="text-xl font-bold mb-2">错误</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-yellow-400" />
              <h1 className="text-3xl font-bold text-white">老虎机管理后台</h1>
            </div>
            <button
              onClick={fetchUsers}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-4 text-left text-white font-bold">用户名</th>
                <th className="px-6 py-4 text-left text-white font-bold">金币</th>
                <th className="px-6 py-4 text-left text-white font-bold">总抽奖</th>
                <th className="px-6 py-4 text-left text-white font-bold">总获胜</th>
                <th className="px-6 py-4 text-left text-white font-bold">最大赢取</th>
                <th className="px-6 py-4 text-left text-white font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <motion.tr
                  key={user.username}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-white/10 hover:bg-white/5"
                >
                  <td className="px-6 py-4 text-white">{user.username}</td>
                  <td className="px-6 py-4">
                    {editingUser === user.username ? (
                      <input
                        type="number"
                        value={editCoins}
                        onChange={(e) => setEditCoins(Number(e.target.value))}
                        className="px-3 py-1 bg-white/20 text-white rounded border border-white/30 w-32"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-yellow-400 font-bold">
                        <Coins className="w-4 h-4" />
                        {user.coins}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white">{user.totalSpins}</td>
                  <td className="px-6 py-4 text-white">{user.totalWins}</td>
                  <td className="px-6 py-4 text-white">{user.biggestWin}</td>
                  <td className="px-6 py-4">
                    {editingUser === user.username ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateUserCoins(user.username, editCoins)}
                          className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                        >
                          <Save className="w-3 h-3" />
                          保存
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingUser(user.username);
                          setEditCoins(user.coins);
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                      >
                        编辑金币
                      </button>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12 text-white/60">
              暂无用户数据
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
