import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateTopUpDto } from './dto/create-top-up.dto';
import { Role } from '../../generated/prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getMyWallet(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/transactions')
  getMyTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getMyTransactions(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get('users/:userId')
  getWalletByUserId(@Param('userId') userId: string) {
    return this.walletService.getWalletByUserId(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get('users/:userId/transactions')
  getTransactionsByUserId(@Param('userId') userId: string) {
    return this.walletService.getTransactionsByUserId(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Post('users/:userId/adjust')
  adjustWallet(
    @Param('userId') userId: string,
    @Body() dto: AdjustWalletDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.walletService.adjustWallet(userId, dto, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('top-up')
  initiateTopUp(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTopUpDto) {
    return this.walletService.initiateTopUp(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('top-ups')
  getMyTopUps(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getMyTopUps(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('top-up/:id')
  getMyTopUp(@CurrentUser() user: AuthenticatedUser, @Param('id') topUpId: string) {
    return this.walletService.getMyTopUp(user.id, topUpId);
  }
}
