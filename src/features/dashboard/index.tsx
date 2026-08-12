import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Activity, Cpu, Database, Zap } from 'lucide-react'

export function Dashboard() {
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='flex items-center gap-2 font-semibold text-lg'>
          <span>🚀 System Command Center</span>
        </div>
        <div className='ms-auto flex items-center space-x-4'>
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Main Content ===== */}
      <Main>
        <div className='mb-6 flex items-center justify-between space-y-2'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>Base Template Dashboard</h1>
            <p className='text-muted-foreground mt-1'>
              Khung gầm sẵn sàng cho các module: Smart Factory, Exoplanet Explorer hoặc Genome Visualizer.
            </p>
          </div>
          <div className='flex items-center space-x-2'>
            <Button variant='outline'>Documentation</Button>
            <Button>+ Add Module</Button>
          </div>
        </div>

        {/* ===== Metric Cards ===== */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
          <Card className='border-primary/20 bg-card/50 backdrop-blur-sm'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>System Status</CardTitle>
              <Activity className='h-4 w-4 text-emerald-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-emerald-500'>Operational</div>
              <p className='text-xs text-muted-foreground mt-1'>
                All services connected
              </p>
            </CardContent>
          </Card>

          <Card className='border-primary/20 bg-card/50 backdrop-blur-sm'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Active Sensors / Nodes</CardTitle>
              <Cpu className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>24 / 24</div>
              <p className='text-xs text-muted-foreground mt-1'>
                Real-time data stream ready
              </p>
            </CardContent>
          </Card>

          <Card className='border-primary/20 bg-card/50 backdrop-blur-sm'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Data Throughput</CardTitle>
              <Zap className='h-4 w-4 text-amber-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>1.2 MB/s</div>
              <p className='text-xs text-muted-foreground mt-1'>
                WebSocket / REST Latency ~15ms
              </p>
            </CardContent>
          </Card>

          <Card className='border-primary/20 bg-card/50 backdrop-blur-sm'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Storage / Buffer</CardTitle>
              <Database className='h-4 w-4 text-purple-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>98.4%</div>
              <p className='text-xs text-muted-foreground mt-1'>
                Memory buffer healthy
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ===== Main Workspace Container ===== */}
        <Card className='min-h-[400px] border-dashed border-2 flex flex-col items-center justify-center p-8 text-center bg-muted/20'>
          <div className='max-w-md space-y-4'>
            <div className='mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl'>
              ⚙️
            </div>
            <h3 className='text-xl font-semibold'>Sẵn sàng cho Dự Án Mới</h3>
            <p className='text-sm text-muted-foreground'>
              Đây là khu vực chính để cắm Biểu đồ Realtime (Smart Factory), Trình render 3D (Exoplanet NASA) hoặc Trình visualize DNA/Gen.
            </p>
            <div className='pt-2 flex justify-center gap-3'>
              <Button variant='outline' size='sm'>Smart Factory</Button>
              <Button variant='outline' size='sm'>Exoplanet 3D</Button>
              <Button variant='outline' size='sm'>Genome Analyzer</Button>
            </div>
          </div>
        </Card>
      </Main>
    </>
  )
}

