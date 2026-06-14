import { AuthForm } from '../../../../features/auth/auth-form';

export default async function SignupPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params;
  return <AuthForm inviteCode={inviteCode} />;
}
