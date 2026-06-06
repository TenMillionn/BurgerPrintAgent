import {
  Injectable,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientID = this.configService.get<string>('oauth.google.clientID');
    const clientSecret = this.configService.get<string>(
      'oauth.google.clientSecret',
    );
    if (!clientID || !clientSecret) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      );
    }
    return super.canActivate(context);
  }

  /**
   * Carry the caller's desired post-login redirect (e.g. a Chrome extension's
   * chromiumapp.org URL) through the OAuth `state` so the callback can redirect
   * tokens back to wherever the flow started.
   */
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const ext = req.query?.ext_redirect;
    if (typeof ext === 'string' && ext) {
      return {
        state: Buffer.from(JSON.stringify({ ext_redirect: ext })).toString(
          'base64url',
        ),
      };
    }
    return {};
  }
}
