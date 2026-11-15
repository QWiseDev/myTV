// 图片占位符组件 - 实现骨架屏效果（支持暗色模式）
const ImagePlaceholder = ({ aspectRatio }: { aspectRatio: string }) => (
  <div
    className={`w-full ${aspectRatio} rounded-lg`}
    style={{
      background:
        'linear-gradient(90deg, var(--skeleton-color) 25%, var(--skeleton-highlight) 50%, var(--skeleton-color) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shine 1.5s infinite',
    }}
  >
    <style>{`
      @keyframes shine {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      /* 亮色模式变量 */
      :root {
        --skeleton-color: #f2f2f2;
        --skeleton-highlight: #e8e8e8;
      }
      
      /* 暗色模式变量 */
      @media (prefers-color-scheme: dark) {
        :root {
          --skeleton-color: #2a2a2a;
          --skeleton-highlight: #3a3a3a;
        }
      }
      
      .dark {
        --skeleton-color: #2a2a2a;
        --skeleton-highlight: #3a3a3a;
      }
    `}</style>
  </div>
);

export { ImagePlaceholder };
