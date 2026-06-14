'use client';

import { motion } from 'framer-motion';
import { ArrowLeft, Coins, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback,useState } from 'react';

import OriginalFruitMachine from '../../components/fruitMachine/OriginalFruitMachine';

export default function FruitMachinePage() {
  const router = useRouter();
  const [coins, setCoins] = useState(1000000); // 默认100万金币

  // 从localStorage获取实际金币余额
  React.useEffect(() => {
    const savedCoins = localStorage.getItem('userCoins');
    if (savedCoins) {
      const coinsValue = parseInt(savedCoins);
      setCoins(coinsValue);
    } else {
      // 如果没有保存的金币，尝试从老虎机数据中获取
      const slotCoins = localStorage.getItem('slotMachineCoins');
      if (slotCoins) {
        setCoins(parseInt(slotCoins));
      }
    }
  }, []);

  const handleCoinsChange = useCallback((newCoins: number) => {
    setCoins(newCoins);
    // 同步到localStorage，确保两个游戏之间金币同步
    localStorage.setItem('userCoins', newCoins.toString());
    localStorage.setItem('slotMachineCoins', newCoins.toString());
  }, []);

  const handleClose = useCallback(() => {
    router.push('/slot');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* 顶部导航栏 */}
      <div className="bg-black bg-opacity-30 backdrop-blur-sm border-b border-white border-opacity-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push('/slot')}
                className="p-2 bg-white bg-opacity-10 rounded-lg hover:bg-opacity-20 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </motion.button>

              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                水果机
              </h1>
            </div>

            <div className="flex items-center gap-2 bg-white bg-opacity-10 px-4 py-2 rounded-lg">
              <Coins className="w-5 h-5 text-yellow-400" />
              <span className="text-white font-bold">{coins.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-4">
        <OriginalFruitMachine
          coins={coins}
          onCoinsChange={handleCoinsChange}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}