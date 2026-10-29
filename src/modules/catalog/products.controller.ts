import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import {
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantLookupDto,
  VariantSearchDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@ApiTags('Products')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with their SKUs and current stock' })
  list(@Query() query: ProductQueryDto) {
    return this.products.list(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Distinct product categories, for filters and suggestions' })
  categories() {
    return this.products.categories();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product with one or more SKUs (and optional opening stock)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post(':id/variants')
  @ApiOperation({ summary: 'Add a SKU (size / colour) to an existing product' })
  addVariant(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVariantDto) {
    return this.products.addVariant(user, id, dto);
  }
}

@ApiTags('Products')
@ApiBearerAuth()
@Controller({ path: 'variants', version: '1' })
export class VariantsController {
  constructor(private readonly products: ProductsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search active SKUs by SKU, barcode or product name' })
  search(@Query() query: VariantSearchDto) {
    return this.products.searchVariants(query.q, query.limit);
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Find one SKU by exact SKU code or barcode (barcode scanners)' })
  lookup(@Query() query: VariantLookupDto) {
    return this.products.lookupVariant(query.code);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a SKU (stock is changed through entries, not here)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVariantDto) {
    return this.products.updateVariant(id, dto);
  }
}
