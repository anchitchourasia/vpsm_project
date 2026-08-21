import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PassSticker } from './pass-sticker';

describe('PassSticker', () => {
  let component: PassSticker;
  let fixture: ComponentFixture<PassSticker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PassSticker],
    }).compileComponents();

    fixture = TestBed.createComponent(PassSticker);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});