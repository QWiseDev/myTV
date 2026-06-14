import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  disableMobilePadding?: boolean;
  fullWidth?: boolean;
}

const PageLayout = ({
  children,
  activePath = '/',
  disableMobilePadding = false,
  fullWidth = false,
}: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      <Header activePath={activePath} />

      <main
        className={`flex-1 transition-all duration-300 ${
          disableMobilePadding ? 'mb-0' : 'mb-14 md:mb-0'
        }`}
        style={{
          paddingTop: 'calc(4rem + env(safe-area-inset-top))',
          paddingBottom: disableMobilePadding ? 0 : 'calc(3.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <div
          className={`transition-all duration-300 ${
            disableMobilePadding ? 'py-0' : 'pt-2 pb-4 lg:pt-3 lg:pb-6'
          } ${fullWidth ? 'w-full px-0' : 'container mx-auto px-4 lg:px-6'}`}
        >
          {children}
        </div>
      </main>

      <div className={`md:hidden ${disableMobilePadding ? 'hidden' : ''}`}>
        <MobileBottomNav activePath={activePath} />
      </div>
    </div>
  );
};

export default PageLayout;
