package com.heg.vehiclePassManagementSystem.controller;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.heg.vehiclePassManagementSystem.model.Vehicle;
import com.heg.vehiclePassManagementSystem.repository.VehicleRepository;

@RestController
@RequestMapping("/api/vehicles")
public class VehicleController {

    @Autowired
    private VehicleRepository vehicleRepository;

    @GetMapping("/list")
    public List<Vehicle> getAllVehicles() {
        return vehicleRepository.findAll();
    }

    @PostMapping("/register")
    public Vehicle registerVehicle(@RequestBody Vehicle vehicle) {
        return vehicleRepository.save(vehicle);
    }
}