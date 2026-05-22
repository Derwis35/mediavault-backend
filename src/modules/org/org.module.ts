import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Country } from './entities/country.entity';
import { State } from './entities/state.entity';
import { Municipality } from './entities/municipality.entity';
import { Zone } from './entities/zone.entity';
import { Quadrant } from './entities/quadrant.entity';
import { OrgService } from './org.service';
import { OrgController } from './org.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Country, State, Municipality, Zone, Quadrant])],
  providers: [OrgService],
  controllers: [OrgController],
  exports: [OrgService],
})
export class OrgModule {}
