import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '水果机 - 卡拉米影视',
  description: '经典水果机游戏，赢取金币奖励！',
};

export default function FruitMachineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}