'use client';

import { motion } from 'framer-motion';
import React from 'react';

interface AnimatedCardGridProps {
  children: React.ReactNode;
  className?: string;
  /** 仅对前 N 张做入场动画，降低长列表主线程压力 */
  maxAnimatedItems?: number;
}

// 容器动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

// 子元素动画配置
const itemVariants = {
  hidden: {
    opacity: 0,
    y: 12,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 140,
      damping: 18,
      mass: 0.45,
    },
  },
};

export default function AnimatedCardGrid({
  children,
  className = '',
  maxAnimatedItems = 8,
}: AnimatedCardGridProps) {
  const childArray = React.Children.toArray(children);

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      {childArray.map((child, index) =>
        index < maxAnimatedItems ? (
          <motion.div
            key={index}
            variants={itemVariants}
            className='flex-shrink-0'
          >
            {child}
          </motion.div>
        ) : (
          <div key={index} className='flex-shrink-0'>
            {child}
          </div>
        ),
      )}
    </motion.div>
  );
}
