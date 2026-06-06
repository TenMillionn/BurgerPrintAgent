import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiPublic, ApiAuth } from '../common/decorators/http.decorators';
import { CurrentUser } from './decorators/current-user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiPublic({ summary: 'Register a new user' })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @ApiPublic({ summary: 'Login user with email and password' })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    // req.user contains tokens from LocalStrategy
    return req.user;
  }

  @ApiPublic({ summary: 'Refresh access token' })
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @ApiAuth({ summary: 'Logout user' })
  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }) {
    if (body.refreshToken) {
      await this.authService.logout(body.refreshToken);
    }
    return { success: true };
  }

  @ApiAuth({ summary: 'Get current user profile' })
  @Get('me')
  getProfile(@CurrentUser() user: UserDocument) {
    return {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatar: user.avatar,
    };
  }

  @ApiPublic({ summary: 'Initiates the Google OAuth flow' })
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  async googleAuth() {
    // Initiates the Google OAuth flow
  }

  @ApiPublic({ summary: 'Google OAuth callback' })
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleAuthRedirect(@Req() req: any, @Res() res: any) {
    const { accessToken, refreshToken } = req.user;
    const params = new URLSearchParams({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    // Default: redirect back to the web app. If the flow carried an ext_redirect
    // (e.g. a Chrome extension's chromiumapp.org URL via OAuth state), use that.
    let target =
      (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '') +
      '/';
    const state = req.query?.state;
    if (typeof state === 'string' && state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
        if (decoded.ext_redirect) target = decoded.ext_redirect;
      } catch {
        /* ignore malformed state */
      }
    }
    const sep = target.includes('?') ? '&' : '?';
    return res.redirect(`${target}${sep}${params.toString()}`);
  }
}
