import { useTranslation } from 'react-i18next';

import { SignIn, type SignInMode } from './account-sheet';
import { AuthLayout } from './auth-layout';

/**
 * The front door, and the only one: a first visit, a returning person, a
 * device locked after a while away - everyone sees this same page. What
 * happens to data already on the device is the app's business, done quietly
 * behind the sign-in (src/app/account.ts), never something to read here.
 */
export function WelcomeScreen() {
  const { t } = useTranslation();
  const titles: Record<SignInMode, string> = {
    signin: t('account.welcome.signInTitle'),
    signup: t('account.welcome.signUpTitle'),
    reset: t('account.welcome.resetTitle'),
  };
  return (
    <AuthLayout>
      {/* The session arrives through the controller; nothing to do on success. */}
      <SignIn
        initial="signin"
        onDone={() => undefined}
        title={(mode) => (
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{titles[mode]}</h1>
        )}
      />
    </AuthLayout>
  );
}
