import { AppDetailWidget } from '../../../../widgets/app-detail/app-detail';

export default async function AppDetailPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;
  return <AppDetailWidget appId={appId} />;
}
