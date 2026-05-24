import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clasificacion } from './entities/clasificacion.entity';
import { Etiqueta } from './entities/etiqueta.entity';
import { ClasificacionesService } from './clasificaciones.service';
import { EtiquetasService } from './etiquetas.service';
import { ClasificacionesController } from './clasificaciones.controller';
import { EtiquetasController } from './etiquetas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Clasificacion, Etiqueta])],
  controllers: [ClasificacionesController, EtiquetasController],
  providers: [ClasificacionesService, EtiquetasService],
  exports: [ClasificacionesService, EtiquetasService],
})
export class ClasificacionesModule {}
