import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { RescheduleAliclikOrderDto } from './dto/reschedule-aliclik-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';
import { AliclikService } from '../aliclik/aliclik.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly aliclikService: AliclikService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  bulkCreateOrders(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ordersService.bulkCreateOrders(user.id, file.buffer);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getMyOrders(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/capacity')
  getMyCreationCapacity(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.getMyCreationCapacity(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/packages')
  getPackageConfig() {
    return this.ordersService.getPackageConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/:orderId')
  getMyOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.ordersService.getMyOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/:orderId/history')
  getMyOrderHistory(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.ordersService.getMyOrderHistory(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/:orderId/aliclik')
  getAliclikSyncState(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.getSyncState(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/:orderId/aliclik/quote')
  quoteAliclikShipping(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.quoteShipping(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/:orderId/aliclik')
  createAliclikOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.createOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/:orderId/aliclik')
  updateAliclikOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.updateOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/:orderId/aliclik/confirm')
  confirmAliclikOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.confirmOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/:orderId/aliclik/reschedule')
  rescheduleAliclikOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: RescheduleAliclikOrderDto,
  ) {
    return this.aliclikService.rescheduleOrder(user.id, orderId, dto.scheduleDate);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/:orderId/aliclik/cancel')
  cancelAliclikOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.aliclikService.cancelOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/:orderId/aliclik/by-number/:orderNumber')
  getAliclikOrderByNumber(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.aliclikService.getOrderByNumber(user.id, orderId, orderNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/:orderId')
  updateOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.updateOrder(user.id, orderId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete('me/:orderId')
  deleteOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.ordersService.deleteOrder(user.id, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Patch('me/:orderId/label')
  markLabelGenerated(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body('generated') generated: boolean,
  ) {
    return this.ordersService.markLabelGenerated(user.id, orderId, generated);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get()
  getAdminOrders() {
    return this.ordersService.getAdminOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get('aliclik-errors')
  getOrdersWithAliclikErrors() {
    return this.ordersService.getOrdersWithAliclikErrors();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Post(':orderId/aliclik/retry')
  retryAliclikOrderSync(@Param('orderId') orderId: string) {
    return this.aliclikService.retryOrderSync(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get(':orderId')
  getAdminOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getAdminOrder(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get(':orderId/history')
  getAdminOrderHistory(@Param('orderId') orderId: string) {
    return this.ordersService.getAdminOrderHistory(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Patch(':orderId/status')
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateOrderStatus(orderId, dto, user.id);
  }
}
