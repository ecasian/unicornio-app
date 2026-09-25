import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './db/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { ClientesModule } from './modules/clientes/clientes.module.js';
import { RepartidoresModule } from './modules/repartidores/repartidores.module.js';
import { CatalogoModule } from './modules/catalogo/catalogo.module.js';
import { StockObjetivoModule } from './modules/stock-objetivo/stock-objetivo.module.js';
import { ExistenciasModule } from './modules/existencias/existencias.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    HealthModule,
    ClientesModule,
    RepartidoresModule,
    CatalogoModule,
    StockObjetivoModule,
    ExistenciasModule,
  ],
})
export class AppModule {}
