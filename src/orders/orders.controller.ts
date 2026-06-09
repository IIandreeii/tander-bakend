import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.id, dto);
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get()
  getAdminOrders() {
    return this.ordersService.getAdminOrders();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_MASTER)
  @Get(':orderId')
  getAdminOrder(@Param('orderId') orderId: string) {
    return this.ordersService.getAdminOrder(orderId);
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
