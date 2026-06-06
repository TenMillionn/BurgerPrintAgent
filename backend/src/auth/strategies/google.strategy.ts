import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

/**
 * Google OAuth strategy. When GOOGLE_CLIENT_ID/SECRET are not configured we do
 * NOT silently run with fake credentials (which fail confusingly at Google).
 * Instead we log a clear warning and make the /auth/google route return a
 * configuration error, while email/password auth keeps working.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly log = new Logger(GoogleStrategy.name);
  private readonly configured: boolean;

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>('oauth.google.clientID');
    const clientSecret = configService.get<string>('oauth.google.clientSecret');
    const callbackURL = configService.get<string>('oauth.google.callbackURL');

    // passport-google-oauth20 requires non-empty values at construction; use an
    // obvious placeholder when unconfigured (guarded in validate()).
    super({
      clientID: clientID || 'GOOGLE_OAUTH_NOT_CONFIGURED',
      clientSecret: clientSecret || 'GOOGLE_OAUTH_NOT_CONFIGURED',
      callbackURL: callbackURL || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });

    this.configured = Boolean(clientID && clientSecret);
    if (!this.configured) {
      GoogleStrategy.log.warn(
        'Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing). ' +
          'The /auth/google route will return a configuration error; email/password login still works.',
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    if (!this.configured) {
      done(new Error('Google OAuth is not configured on this server'), false);
      return;
    }
    try {
      const user = await this.authService.validateOAuthUser(profile);
      const tokens = await this.authService.generateTokens(
        user,
        'google-oauth',
      );
      done(null, tokens);
    } catch (err) {
      done(err, false);
    }
  }
}
