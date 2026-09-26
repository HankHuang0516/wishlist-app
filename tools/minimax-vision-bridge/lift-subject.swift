// Local macOS post-processing prototype. The exported foreground retains
// source-photo pixels; unlike image-to-image output, the product is not redrawn.
import AppKit
import CoreImage
import Vision

guard CommandLine.arguments.count == 3 else {
    fputs("usage: swift lift-subject.swift input-image output-png\n", stderr)
    exit(2)
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let handler = VNImageRequestHandler(url: input)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let observation = request.results?.first, !observation.allInstances.isEmpty,
      let original = CIImage(contentsOf: input) else {
    throw NSError(domain: "WishlistMarketing", code: 1,
                  userInfo: [NSLocalizedDescriptionKey: "FOREGROUND_NOT_FOUND"])
}
let buffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
let mask = CIImage(cvPixelBuffer: buffer)
let transparent = CIImage(color: .clear).cropped(to: original.extent)
let result = original.applyingFilter("CIBlendWithMask", parameters: [
    kCIInputBackgroundImageKey: transparent,
    kCIInputMaskImageKey: mask,
])
let context = CIContext()
guard let cgImage = context.createCGImage(result, from: original.extent),
      let png = NSBitmapImageRep(cgImage: cgImage).representation(using: .png, properties: [:]) else {
    throw NSError(domain: "WishlistMarketing", code: 2,
                  userInfo: [NSLocalizedDescriptionKey: "FOREGROUND_EXPORT_FAILED"])
}
try png.write(to: output, options: .atomic)
print("FOREGROUND_OK width=\(cgImage.width) height=\(cgImage.height) instances=\(observation.allInstances.count)")
